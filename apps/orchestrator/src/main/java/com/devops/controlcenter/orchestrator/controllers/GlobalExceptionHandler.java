package com.devops.controlcenter.orchestrator.controllers;

import com.devops.controlcenter.orchestrator.exceptions.AgentUnreachableException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.Instant;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger logger = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(AgentUnreachableException.class)
    public ResponseEntity<Map<String, Object>> handleAgentUnreachableException(AgentUnreachableException ex) {
        logger.error("GlobalExceptionHandler caught AgentUnreachableException: {}", ex.getMessage());
        
        Map<String, Object> body = Map.of(
            "timestamp", Instant.now().toString(),
            "status", HttpStatus.SERVICE_UNAVAILABLE.value(),
            "error", "Service Unavailable",
            "message", ex.getMessage()
        );
        
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(body);
    }
}
