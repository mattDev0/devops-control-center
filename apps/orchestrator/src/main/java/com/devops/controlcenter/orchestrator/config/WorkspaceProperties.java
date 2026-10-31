package com.devops.controlcenter.orchestrator.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConfigurationProperties(prefix = "workspace")
public class WorkspaceProperties {

    private Status status = new Status();
    private Linode linode = new Linode();
    private Github github = new Github();
    private String syncHosts = "matt-PC=Laptop (WSL),dev-workspace=Workspace VM";

    public static class Status {
        private boolean enabled = true;
        private long intervalMs = 300000;
        private long timeoutMs = 10000;

        public boolean isEnabled() {
            return enabled;
        }

        public void setEnabled(boolean enabled) {
            this.enabled = enabled;
        }

        public long getIntervalMs() {
            return intervalMs;
        }

        public void setIntervalMs(long intervalMs) {
            this.intervalMs = intervalMs;
        }

        public long getTimeoutMs() {
            return timeoutMs;
        }

        public void setTimeoutMs(long timeoutMs) {
            this.timeoutMs = timeoutMs;
        }
    }

    public static class Linode {
        private String apiUrl = "https://api.linode.com/v4";
        private String token = "";
        private String instanceId = "109711421";

        public String getApiUrl() {
            return apiUrl;
        }

        public void setApiUrl(String apiUrl) {
            this.apiUrl = apiUrl;
        }

        public String getToken() {
            return token;
        }

        public void setToken(String token) {
            this.token = token;
        }

        public String getInstanceId() {
            return instanceId;
        }

        public void setInstanceId(String instanceId) {
            this.instanceId = instanceId;
        }
    }

    public static class Github {
        private String apiUrl = "https://api.github.com";
        private String token = "";
        private String repo = "mattDev0/agent-memory";

        public String getApiUrl() {
            return apiUrl;
        }

        public void setApiUrl(String apiUrl) {
            this.apiUrl = apiUrl;
        }

        public String getToken() {
            return token;
        }

        public void setToken(String token) {
            this.token = token;
        }

        public String getRepo() {
            return repo;
        }

        public void setRepo(String repo) {
            this.repo = repo;
        }
    }

    public Status getStatus() {
        return status;
    }

    public void setStatus(Status status) {
        this.status = status;
    }

    public Linode getLinode() {
        return linode;
    }

    public void setLinode(Linode linode) {
        this.linode = linode;
    }

    public Github getGithub() {
        return github;
    }

    public void setGithub(Github github) {
        this.github = github;
    }

    public String getSyncHosts() {
        return syncHosts;
    }

    public void setSyncHosts(String syncHosts) {
        this.syncHosts = syncHosts;
    }
}
