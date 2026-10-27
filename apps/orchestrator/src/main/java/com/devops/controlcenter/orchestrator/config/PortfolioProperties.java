package com.devops.controlcenter.orchestrator.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import java.util.LinkedHashMap;
import java.util.Map;

@Configuration
@ConfigurationProperties(prefix = "portfolio")
public class PortfolioProperties {

    private Probe probe = new Probe();
    private Map<String, String> targets = new LinkedHashMap<>();

    public static class Probe {
        private boolean enabled = true;
        private long intervalMs = 60000;
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

    public Probe getProbe() {
        return probe;
    }

    public void setProbe(Probe probe) {
        this.probe = probe;
    }

    public Map<String, String> getTargets() {
        return targets;
    }

    public void setTargets(Map<String, String> targets) {
        this.targets = targets;
    }
}
