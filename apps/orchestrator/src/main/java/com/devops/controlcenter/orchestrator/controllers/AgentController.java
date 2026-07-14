package com.devops.controlcenter.orchestrator.controllers;

import com.devops.controlcenter.orchestrator.dto.AgentHealthDto;
import com.devops.controlcenter.orchestrator.dto.DeploymentDto;
import com.devops.controlcenter.orchestrator.dto.PodHealthDto;
import com.devops.controlcenter.orchestrator.dto.DockerContainerDto;
import com.devops.controlcenter.orchestrator.dto.DockerContainerStatsDto;
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

    @GetMapping("/pods/health")
    public ResponseEntity<List<PodHealthDto>> getPodHealth() {
        logger.info("Received request for K8s pod health status.");
        return ResponseEntity.ok(agentService.fetchPodHealth());
    }

    @GetMapping("/docker/containers")
    public ResponseEntity<List<DockerContainerDto>> getDockerContainers() {
        logger.info("Received request for all Docker containers.");
        return ResponseEntity.ok(agentService.getDockerContainers());
    }

    @PostMapping("/docker/containers/{id}/{action}")
    public ResponseEntity<Void> executeDockerContainerAction(@PathVariable String id, @PathVariable String action) {
        logger.info("Received request to execute Docker container action {} for ID {}", action, id);
        agentService.executeDockerContainerAction(id, action);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/docker/containers/{id}/stats")
    public ResponseEntity<DockerContainerStatsDto> getDockerContainerStats(@PathVariable String id) {
        logger.info("Received request for Docker container stats. ID: {}", id);
        return ResponseEntity.ok(agentService.getDockerContainerStats(id));
    }

    @GetMapping(value = "/docker/containers/{id}/logs", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamDockerContainerLogs(@PathVariable String id) {
        logger.info("Received request to stream logs for Docker container ID: {}", id);
        return agentService.streamDockerContainerLogs(id);
    }
}
