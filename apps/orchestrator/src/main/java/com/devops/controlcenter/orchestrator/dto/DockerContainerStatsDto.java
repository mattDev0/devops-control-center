package com.devops.controlcenter.orchestrator.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public class DockerContainerStatsDto {
    @JsonProperty("cpu_percent")
    private double cpuPercent;

    @JsonProperty("memory_percent")
    private double memoryPercent;

    @JsonProperty("memory_usage_bytes")
    private long memoryUsageBytes;

    @JsonProperty("memory_limit_bytes")
    private long memoryLimitBytes;

    // Constructors
    public DockerContainerStatsDto() {}

    public DockerContainerStatsDto(double cpuPercent, double memoryPercent, long memoryUsageBytes, long memoryLimitBytes) {
        this.cpuPercent = cpuPercent;
        this.memoryPercent = memoryPercent;
        this.memoryUsageBytes = memoryUsageBytes;
        this.memoryLimitBytes = memoryLimitBytes;
    }

    // Getters and Setters
    public double getCpuPercent() { return cpuPercent; }
    public void setCpuPercent(double cpuPercent) { this.cpuPercent = cpuPercent; }

    public double getMemoryPercent() { return memoryPercent; }
    public void setMemoryPercent(double memoryPercent) { this.memoryPercent = memoryPercent; }

    public long getMemoryUsageBytes() { return memoryUsageBytes; }
    public void setMemoryUsageBytes(long memoryUsageBytes) { this.memoryUsageBytes = memoryUsageBytes; }

    public long getMemoryLimitBytes() { return memoryLimitBytes; }
    public void setMemoryLimitBytes(long memoryLimitBytes) { this.memoryLimitBytes = memoryLimitBytes; }
}
