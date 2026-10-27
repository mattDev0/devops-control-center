package com.devops.controlcenter.orchestrator.controllers;

import com.devops.controlcenter.orchestrator.dto.PortfolioStatusDto;
import com.devops.controlcenter.orchestrator.services.PortfolioProbeService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Exposes portfolio uptime probe status and history to the dashboard.
 * Reads in-memory state only; never triggers outbound network calls.
 */
@RestController
@RequestMapping("/api/portfolio")
public class PortfolioController {

    private final PortfolioProbeService probeService;

    public PortfolioController(PortfolioProbeService probeService) {
        this.probeService = probeService;
    }

    @GetMapping("/status")
    public ResponseEntity<PortfolioStatusDto> getStatus() {
        return ResponseEntity.ok(probeService.getStatus());
    }
}
