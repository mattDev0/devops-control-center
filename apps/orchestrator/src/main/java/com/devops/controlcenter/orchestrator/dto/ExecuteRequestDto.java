package com.devops.controlcenter.orchestrator.dto;

import java.util.List;

public class ExecuteRequestDto {
    private String command;
    private List<String> args;

    // Constructors
    public ExecuteRequestDto() {}

    public ExecuteRequestDto(String command, List<String> args) {
        this.command = command;
        this.args = args;
    }

    // Getters and Setters
    public String getCommand() { return command; }
    public void setCommand(String command) { this.command = command; }

    public List<String> getArgs() { return args; }
    public void setArgs(List<String> args) { this.args = args; }
}
