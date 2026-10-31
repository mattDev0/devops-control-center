package com.devops.controlcenter.orchestrator.controllers;

import com.devops.controlcenter.orchestrator.dto.WorkspaceStatusDto;
import com.devops.controlcenter.orchestrator.services.WorkspaceStatusService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Exposes dev workspace status (Linode VM, Linode credit, memory sync) to the dashboard.
 * Reads in-memory state only; never triggers outbound network calls.
 */
@RestController
@RequestMapping("/api/workspace")
public class WorkspaceController {

    private final WorkspaceStatusService workspaceStatusService;

    public WorkspaceController(WorkspaceStatusService workspaceStatusService) {
        this.workspaceStatusService = workspaceStatusService;
    }

    @GetMapping("/status")
    public ResponseEntity<WorkspaceStatusDto> getStatus() {
        return ResponseEntity.ok(workspaceStatusService.getStatus());
    }
}
