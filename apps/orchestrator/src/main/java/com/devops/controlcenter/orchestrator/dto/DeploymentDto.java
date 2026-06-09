package com.devops.controlcenter.orchestrator.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public class DeploymentDto {
    private String id;
    private String name;
    private String image;
    private String state;
    private String status;

    @JsonProperty("error_message")
    private String errorMessage;

    @JsonProperty("updated_at")
    private String updatedAt;

    // Constructors
    public DeploymentDto() {}

    public DeploymentDto(String id, String name, String image, String state, String status, String errorMessage, String updatedAt) {
        this.id = id;
        this.name = name;
        this.image = image;
        this.state = state;
        this.status = status;
        this.errorMessage = errorMessage;
        this.updatedAt = updatedAt;
    }

    // Getters and Setters
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getImage() { return image; }
    public void setImage(String image) { this.image = image; }

    public String getState() { return state; }
    public void setState(String state) { this.state = state; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }

    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String updatedAt) { this.updatedAt = updatedAt; }
}
