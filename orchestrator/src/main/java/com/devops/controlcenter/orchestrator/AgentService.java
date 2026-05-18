package com.devops.controlcenter.orchestrator;

import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

@Service
public class AgentService {

    private final RestClient restClient;

    public AgentService() {
        // Initialize the modern RestClient
        this.restClient = RestClient.create();
    }

    public Object fetchAgentHealth() {
        // In a real app, the IP "localhost:3001" would be dynamic based on a database
        // of registered servers. For now, we hardcode our local WSL agent.
        String agentUrl = "http://localhost:3001/ping";
        
        try {
            // Make the GET request to the Rust agent and return its JSON response as a Map/Object
            return restClient.get()
                    .uri(agentUrl)
                    .retrieve()
                    .body(Object.class);
        } catch (Exception e) {
            System.err.println("❌ Failed to contact Rust Agent: " + e.getMessage());
            return "{\"error\": \"Failed to contact agent at " + agentUrl + "\"}";
        }
    }
}