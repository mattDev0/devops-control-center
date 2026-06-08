package com.devops.controlcenter.orchestrator.controllers;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class HealthController {

    @GetMapping("/health")
    public ResponseEntity<?> getHealth() {
        return ResponseEntity.ok(Map.of("status", "UP"));
    }
}
