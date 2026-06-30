package com.devops.controlcenter.orchestrator.services;

import com.devops.controlcenter.orchestrator.dto.AgentHealthDto;
import com.devops.controlcenter.orchestrator.dto.DeploymentDto;
import com.devops.controlcenter.orchestrator.exceptions.AgentUnreachableException;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

@Service
public class AgentService {

    private static final Logger logger = LoggerFactory.getLogger(AgentService.class);

    private final RestClient restClient;
    private final ExecutorService executorService = Executors.newVirtualThreadPerTaskExecutor();

    public AgentService(
            RestClient.Builder restClientBuilder,
            @Value("${agent.url:http://localhost:3001}") String agentUrl,
            @Value("${agent.secret-key}") String agentSecretKey) {
        this.restClient = restClientBuilder
                .baseUrl(agentUrl)
                .defaultHeader("X-Agent-Key", agentSecretKey)
                .build();
    }

    public AgentHealthDto fetchAgentHealth() {
        try {
            logger.info("Fetching agent health status...");
            return this.restClient.get().uri("/health").retrieve().body(AgentHealthDto.class);
        } catch (Exception e) {
            logger.error("Agent is unreachable on /health: {}", e.getMessage());
            throw new AgentUnreachableException("Agent is unreachable", e);
        }
    }

    public SseEmitter streamAgentLogs(String deploymentId) {
        logger.info("Initiating log streaming for deployment: {}", deploymentId);
        SseEmitter emitter = new SseEmitter(300_000L); // 5-minute timeout to prevent infinite hangs

        // Track client disconnection so the blocking reader thread can exit
        AtomicBoolean clientDisconnected = new AtomicBoolean(false);
        // Hold a reference to the upstream InputStream and ClientHttpResponse so we can close them to unblock readLine()
        AtomicBoolean cancelled = new AtomicBoolean(false);
        final InputStream[] upstreamRef = new InputStream[1];
        final ClientHttpResponse[] responseRef = new ClientHttpResponse[1];

        Runnable cancelUpstream = () -> {
            if (cancelled.compareAndSet(false, true)) {
                clientDisconnected.set(true);
                // Close the ClientHttpResponse to abort the HTTP network connection
                ClientHttpResponse response = responseRef[0];
                if (response != null) {
                    try {
                        response.close();
                    } catch (Exception ignored) {
                        // Expected when aborting a streaming connection
                    }
                }
                // Close the upstream InputStream as a fallback
                InputStream is = upstreamRef[0];
                if (is != null) {
                    try {
                        is.close();
                    } catch (Exception ignored) {
                        // Expected when aborting a streaming connection
                    }
                }
            }
        };

        emitter.onCompletion(cancelUpstream);
        emitter.onTimeout(cancelUpstream);
        emitter.onError(e -> cancelUpstream.run());

        executorService.execute(() -> {
            try {
                String uri = "/logs" + (deploymentId != null ? "?id=" + deploymentId : "");
                this.restClient.get().uri(uri).exchange((request, response) -> {
                    responseRef[0] = response;
                    upstreamRef[0] = response.getBody();
                    BufferedReader reader = new BufferedReader(new InputStreamReader(upstreamRef[0]));
                    String line;
                    while (!clientDisconnected.get() && (line = reader.readLine()) != null) {
                        if (line.startsWith("data:")) {
                            try {
                                emitter.send(line.substring(5).trim());
                            } catch (Exception sendEx) {
                                // Client disconnected mid-send
                                logger.debug("Client disconnected during log stream send: {}", sendEx.getMessage());
                                break;
                            }
                        }
                    }
                    return null;
                });
                if (!clientDisconnected.get()) {
                    emitter.complete();
                }
            } catch (Exception e) {
                if (!clientDisconnected.get()) {
                    logger.error("Error occurred during log streaming: {}", e.getMessage());
                    try {
                        emitter.completeWithError(e);
                    } catch (Exception ignored) {
                        // Emitter already completed
                    }
                } else {
                    logger.debug("Log stream closed after client disconnect for deployment: {}", deploymentId);
                }
            }
        });
        return emitter;
    }

    public List<DeploymentDto> getDeployments() {
        try {
            logger.info("Fetching all deployments from agent...");
            return this.restClient.get().uri("/deployments").retrieve().body(new ParameterizedTypeReference<List<DeploymentDto>>() {});
        } catch (Exception e) {
            logger.error("Agent is unreachable on /deployments: {}", e.getMessage());
            throw new AgentUnreachableException("Agent is unreachable", e);
        }
    }

    public void executeDeploymentAction(String id, String action) {
        try {
            logger.info("Executing deployment action {} for deployment ID {}", action, id);
            this.restClient.post().uri("/deployments/" + id + "/" + action).retrieve().toBodilessEntity();
        } catch (Exception e) {
            logger.error("Agent is unreachable on /deployments/{}/{}: {}", id, action, e.getMessage());
            throw new AgentUnreachableException("Agent is unreachable", e);
        }
    }

    @PreDestroy
    public void shutdown() {
        logger.info("Shutting down AgentService executor service.");
        this.executorService.shutdown();
    }
}
