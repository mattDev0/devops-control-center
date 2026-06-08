package com.devops.controlcenter.orchestrator.controllers;
import com.devops.controlcenter.orchestrator.services.GithubService;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/ci")
public class GithubController {

    private final GithubService githubService;

    public GithubController(GithubService githubService) {
        this.githubService = githubService;
    }

    @GetMapping("/workflows")
    public ResponseEntity<List<Map<String, Object>>> getWorkflows() {
        return ResponseEntity.ok(githubService.getRecentWorkflows());
    }

    @PostMapping("/workflows/{id}/dispatch")
    public ResponseEntity<Void> triggerWorkflow(@PathVariable String id) {
        githubService.triggerWorkflow(id);
        return ResponseEntity.ok().build();
    }
}