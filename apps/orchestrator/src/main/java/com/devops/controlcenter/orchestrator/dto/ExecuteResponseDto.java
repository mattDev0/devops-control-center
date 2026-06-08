package com.devops.controlcenter.orchestrator.dto;

public class ExecuteResponseDto {
    private String stdout;
    private String stderr;
    private int exitCode;

    // Constructors
    public ExecuteResponseDto() {}

    public ExecuteResponseDto(String stdout, String stderr, int exitCode) {
        this.stdout = stdout;
        this.stderr = stderr;
        this.exitCode = exitCode;
    }

    // Getters and Setters
    public String getStdout() { return stdout; }
    public void setStdout(String stdout) { this.stdout = stdout; }

    public String getStderr() { return stderr; }
    public void setStderr(String stderr) { this.stderr = stderr; }

    public int getExitCode() { return exitCode; }
    public void setExitCode(int exitCode) { this.exitCode = exitCode; }
}
