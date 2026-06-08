package com.devops.controlcenter.orchestrator.controllers;

import com.devops.controlcenter.orchestrator.dto.AgentHealthDto;
import com.devops.controlcenter.orchestrator.dto.DeploymentDto;
import com.devops.controlcenter.orchestrator.dto.ExecuteRequestDto;
import com.devops.controlcenter.orchestrator.dto.ExecuteResponseDto;
import com.devops.controlcenter.orchestrator.services.AgentService;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;

@RestController
@RequestMapping("/api/servers")
public class AgentController {

    private static final Logger logger = LoggerFactory.getLogger(AgentController.class);
    private final AgentService agentService;

    public AgentController(AgentService agentService) {
        this.agentService = agentService;
    }

    @GetMapping(value = "/health", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<AgentHealthDto> getHealth() {
        logger.info("Received request for agent health status.");
        return ResponseEntity.ok(agentService.fetchAgentHealth());
    }

    @PostMapping(value = "/execute", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ExecuteResponseDto> executeCommand(@RequestBody ExecuteRequestDto payload) {
        logger.info("Received request to execute command: {}", payload.getCommand());
        ExecuteResponseDto response = agentService.executeCommand(payload);
        return ResponseEntity.ok(response);
    }

    @GetMapping(value = "/logs", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamLogs(@RequestParam(required = false) String id) {
        logger.info("Received request to stream logs. Deployment ID: {}", id);
        return agentService.streamAgentLogs(id);
    }

    @GetMapping("/deployments")
    public ResponseEntity<List<DeploymentDto>> getDeployments() {
        logger.info("Received request for all deployments.");
        return ResponseEntity.ok(agentService.getDeployments());
    }

    @PostMapping("/deployments/{id}/{action}")
    public ResponseEntity<Void> deploymentAction(@PathVariable String id, @PathVariable String action) {
        logger.info("Received request to execute deployment action {} for deployment ID {}", action, id);
        agentService.executeDeploymentAction(id, action);
        return ResponseEntity.ok().build();
    }
}
