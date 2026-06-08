package com.devops.controlcenter.orchestrator.exceptions;

public class AgentUnreachableException extends RuntimeException {
    public AgentUnreachableException(String message) {
        super(message);
    }

    public AgentUnreachableException(String message, Throwable cause) {
        super(message, cause);
    }
}
