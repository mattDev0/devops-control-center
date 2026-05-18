package com.devops.controlcenter.orchestrator;

import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

@Service
public class AgentService {

    private final RestClient restClient;
    // Hardcoded for local testing. In production, this would come from an environment variable!
    private final String agentSecretKey = "devops-secret-key-123";

    public AgentService(RestClient.Builder restClientBuilder) {
        this.restClient = restClientBuilder
                .baseUrl("http://localhost:3001")
                // This line attaches the key to EVERY request automatically
                .defaultHeader("X-Agent-Key", agentSecretKey)
                .build();
    }

    public String fetchAgentHealth() {
        try {
            return this.restClient.get()
                    .uri("/ping")
                    .retrieve()
                    .body(String.class);
        } catch (Exception e) {
            // If unauthorized or down, gracefully return a JSON error instead of crashing the UI
            return "{\"os_name\": \"Offline\", \"os_version\": \"N/A\", \"uptime_seconds\": 0}";
        }
    }
}