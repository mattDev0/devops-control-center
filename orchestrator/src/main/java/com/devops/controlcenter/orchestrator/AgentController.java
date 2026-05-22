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

    @GetMapping(value = "/health", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> getHealth() {
        return ResponseEntity.ok(agentService.fetchAgentHealth());
    }

    @PostMapping(value = "/execute", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> executeCommand(@RequestBody Map<String, Object> payload) {
        String command = (String) payload.getOrDefault("command", "");
        @SuppressWarnings("unchecked")
        List<String> args = (List<String>) payload.getOrDefault("args", List.of());
        System.out.println("Executing command: " + command + " with args: " + args);
        String response = agentService.executeCommand(command, args);
        System.out.println("Agent response: " + response);
        return ResponseEntity.ok(response);
    }

    @GetMapping(value = "/logs", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamLogs() {
        return agentService.streamAgentLogs();
    }

    // NEW: Docker Controller Endpoints
    @GetMapping("/containers")
    public ResponseEntity<String> getContainers() {
        return ResponseEntity.ok(agentService.getContainers());
    }

    @PostMapping("/containers/{id}/{action}")
    public ResponseEntity<Void> containerAction(@PathVariable String id, @PathVariable String action) {
        agentService.executeContainerAction(id, action);
        return ResponseEntity.ok().build();
    }
}
