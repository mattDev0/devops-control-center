package com.devops.controlcenter.orchestrator.dto;

public class AgentHealthDto {
    private String status;
    private boolean k8s;
    private String error;

    // Constructors
    public AgentHealthDto() {}

    public AgentHealthDto(String status, boolean k8s, String error) {
        this.status = status;
        this.k8s = k8s;
        this.error = error;
    }

    // Getters and Setters
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public boolean isK8s() { return k8s; }
    public void setK8s(boolean k8s) { this.k8s = k8s; }

    public String getError() { return error; }
    public void setError(String error) { this.error = error; }
}
