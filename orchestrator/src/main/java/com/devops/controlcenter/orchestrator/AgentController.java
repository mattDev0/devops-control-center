package com.devops.controlcenter.orchestrator;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.beans.factory.annotation.Autowired;

@RestController
@RequestMapping("/api/servers")
public class AgentController {

    private final AgentService agentService;

    @Autowired
    public AgentController(AgentService agentService) {
        this.agentService = agentService;
    }

    @GetMapping("/health")
    public Object getServerHealth() {
        System.out.println("➡️ Received request for server health. Proxying to Rust Agent...");
        return agentService.fetchAgentHealth();
    }
}