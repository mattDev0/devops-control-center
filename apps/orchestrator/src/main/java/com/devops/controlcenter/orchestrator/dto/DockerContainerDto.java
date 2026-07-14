package com.devops.controlcenter.orchestrator.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public class DockerContainerDto {
    private String id;
    private String name;
    private String image;
    private String state;
    private String status;
    private String ports;

    @JsonProperty("created_at")
    private String createdAt;

    // Constructors
    public DockerContainerDto() {}

    public DockerContainerDto(String id, String name, String image, String state, String status, String ports, String createdAt) {
        this.id = id;
        this.name = name;
        this.image = image;
        this.state = state;
        this.status = status;
        this.ports = ports;
        this.createdAt = createdAt;
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

    public String getPorts() { return ports; }
    public void setPorts(String ports) { this.ports = ports; }

    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
}
