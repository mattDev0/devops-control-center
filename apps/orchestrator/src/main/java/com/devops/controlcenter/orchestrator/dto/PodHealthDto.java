package com.devops.controlcenter.orchestrator.dto;

public class PodHealthDto {
    private String namespace;
    private int running;
    private int pending;
    private int failed;
    private int crashLoop;
    private int total;

    // Default constructor
    public PodHealthDto() {}

    public PodHealthDto(String namespace, int running, int pending, int failed, int crashLoop, int total) {
        this.namespace = namespace;
        this.running = running;
        this.pending = pending;
        this.failed = failed;
        this.crashLoop = crashLoop;
        this.total = total;
    }

    // Getters and Setters
    public String getNamespace() { return namespace; }
    public void setNamespace(String namespace) { this.namespace = namespace; }

    public int getRunning() { return running; }
    public void setRunning(int running) { this.running = running; }

    public int getPending() { return pending; }
    public void setPending(int pending) { this.pending = pending; }

    public int getFailed() { return failed; }
    public void setFailed(int failed) { this.failed = failed; }

    public int getCrashLoop() { return crashLoop; }
    public void setCrashLoop(int crashLoop) { this.crashLoop = crashLoop; }

    public int getTotal() { return total; }
    public void setTotal(int total) { this.total = total; }
}
