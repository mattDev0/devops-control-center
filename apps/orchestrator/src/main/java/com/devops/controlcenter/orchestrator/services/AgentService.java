package com.devops.controlcenter.orchestrator.services;

import com.devops.controlcenter.orchestrator.dto.AgentHealthDto;
import com.devops.controlcenter.orchestrator.dto.DeploymentDto;
import com.devops.controlcenter.orchestrator.dto.ExecuteRequestDto;
import com.devops.controlcenter.orchestrator.dto.ExecuteResponseDto;
import com.devops.controlcenter.orchestrator.exceptions.AgentUnreachableException;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Service
public class AgentService {

    private static final Logger logger = LoggerFactory.getLogger(AgentService.class);

    private final RestClient restClient;
    private final ExecutorService executorService = Executors.newFixedThreadPool(10);

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

    public ExecuteResponseDto executeCommand(ExecuteRequestDto requestDto) {
        try {
            logger.info("Requesting agent execution of command: {}", requestDto.getCommand());
            return this.restClient.post().uri("/execute").body(requestDto).retrieve().body(ExecuteResponseDto.class);
        } catch (Exception e) {
            logger.error("Agent is unreachable on /execute: {}", e.getMessage());
            throw new AgentUnreachableException("Agent is unreachable", e);
        }
    }

    public SseEmitter streamAgentLogs(String deploymentId) {
        logger.info("Initiating log streaming for deployment: {}", deploymentId);
        SseEmitter emitter = new SseEmitter(0L);
        executorService.execute(() -> {
            try {
                String uri = "/logs" + (deploymentId != null ? "?id=" + deploymentId : "");
                this.restClient.get().uri(uri).exchange((request, response) -> {
                    BufferedReader reader = new BufferedReader(new InputStreamReader(response.getBody()));
                    String line;
                    while ((line = reader.readLine()) != null) {
                        if (line.startsWith("data:")) emitter.send(line.substring(5).trim());
                    }
                    return null;
                });
                emitter.complete();
            } catch (Exception e) {
                logger.error("Error occurred during log streaming: {}", e.getMessage(), e);
                emitter.completeWithError(e);
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
