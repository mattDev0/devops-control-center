package com.devops.controlcenter.orchestrator;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/servers")
public class AgentController {

    private final AgentService agentService;

    public AgentController(AgentService agentService) {
        this.agentService = agentService;
    }

    @GetMapping("/health")
    public ResponseEntity<String> getHealth() {
        String healthData = agentService.fetchAgentHealth();
        return ResponseEntity.ok(healthData);
    }

    @PostMapping("/execute")
    public ResponseEntity<String> executeCommand(@RequestBody Map<String, Object> payload) {
        String command = (String) payload.getOrDefault("command", "");
        
        @SuppressWarnings("unchecked")
        List<String> args = (List<String>) payload.getOrDefault("args", List.of());
        
        String response = agentService.executeCommand(command, args);
        return ResponseEntity.ok(response);
    }

    // NEW: SSE Proxy Endpoint
    @GetMapping(value = "/logs", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamLogs() {
        return agentService.streamAgentLogs();
    }
}