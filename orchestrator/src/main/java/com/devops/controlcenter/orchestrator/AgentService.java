package com.devops.controlcenter.orchestrator;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;

@Service
public class AgentService {

    private final RestClient restClient;
    public AgentService(
            RestClient.Builder restClientBuilder,
            @Value("${agent.url:http://localhost:3001}") String agentUrl,
            @Value("${agent.secret-key}") String agentSecretKey) {
        this.restClient = restClientBuilder
                .baseUrl(agentUrl)
                .defaultHeader("X-Agent-Key", agentSecretKey)
                .build();
    }

    public String fetchAgentHealth() {
        try {
            return this.restClient.get().uri("/ping").retrieve().body(String.class);
        } catch (Exception e) {
            return "{\"os_name\": \"Offline\", \"os_version\": \"N/A\", \"uptime_seconds\": 0}";
        }
    }

    public String executeCommand(String command, List<String> args) {
        try {
            Map<String, Object> payload = Map.of("command", command, "args", args != null ? args : List.of());
            return this.restClient.post().uri("/execute").body(payload).retrieve().body(String.class);
        } catch (Exception e) {
            return "{\"stdout\": \"\", \"stderr\": \"Orchestrator Error\", \"exit_code\": -1}";
        }
    }

    public SseEmitter streamAgentLogs(String containerId) {
        SseEmitter emitter = new SseEmitter(0L);
        Executors.newSingleThreadExecutor().execute(() -> {
            try {
                String uri = "/logs" + (containerId != null ? "?id=" + containerId : "");
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
                System.err.println("Error occurred during log streaming: " + e.getMessage());
                e.printStackTrace();
                emitter.completeWithError(e);
            }
        });
        return emitter;
    }

    // NEW: Docker Proxy Methods
    public String getContainers() {
        try {
            return this.restClient.get().uri("/containers").retrieve().body(String.class);
        } catch (Exception e) {
            return "[]";
        }
    }

    public void executeContainerAction(String id, String action) {
        try {
            this.restClient.post().uri("/containers/" + id + "/" + action).retrieve().toBodilessEntity();
        } catch (Exception e) {
            System.err.println("Failed to execute container action: " + e.getMessage());
        }
    }
}
