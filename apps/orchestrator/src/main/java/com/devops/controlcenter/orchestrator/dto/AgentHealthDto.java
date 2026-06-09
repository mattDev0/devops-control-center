package com.devops.controlcenter.orchestrator.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public class AgentHealthDto {
    private String status;
    private boolean k8s;
    private String error;

    @JsonProperty("os_name")
    private String osName;

    @JsonProperty("os_version")
    private String osVersion;

    @JsonProperty("uptime_seconds")
    private long uptimeSeconds;

    // Constructors
    public AgentHealthDto() {}

    public AgentHealthDto(String status, boolean k8s, String error) {
        this.status = status;
        this.k8s = k8s;
        this.error = error;
    }

    public AgentHealthDto(String status, boolean k8s, String error, String osName, String osVersion, long uptimeSeconds) {
        this.status = status;
        this.k8s = k8s;
        this.error = error;
        this.osName = osName;
        this.osVersion = osVersion;
        this.uptimeSeconds = uptimeSeconds;
    }

    // Getters and Setters
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public boolean isK8s() { return k8s; }
    public void setK8s(boolean k8s) { this.k8s = k8s; }

    public String getError() { return error; }
    public void setError(String error) { this.error = error; }

    public String getOsName() { return osName; }
    public void setOsName(String osName) { this.osName = osName; }

    public String getOsVersion() { return osVersion; }
    public void setOsVersion(String osVersion) { this.osVersion = osVersion; }

    public long getUptimeSeconds() { return uptimeSeconds; }
    public void setUptimeSeconds(long uptimeSeconds) { this.uptimeSeconds = uptimeSeconds; }
}
