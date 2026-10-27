package com.devops.controlcenter.orchestrator.services;

import com.devops.controlcenter.orchestrator.config.PortfolioProperties;
import com.devops.controlcenter.orchestrator.dto.PortfolioSampleDto;
import com.devops.controlcenter.orchestrator.dto.PortfolioStatusDto;
import com.devops.controlcenter.orchestrator.dto.PortfolioTargetStatusDto;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.net.ConnectException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Periodically probes public portfolio endpoints on Cloud Run and keeps
 * the latest results plus bounded history in memory.
 *
 * Outbound calls only happen on the scheduled timer, preventing guests or
 * API consumers from using the orchestrator to hammer upstream endpoints.
 */
@Service
public class PortfolioProbeService {

    private static final Logger logger = LoggerFactory.getLogger(PortfolioProbeService.class);
    private static final int MAX_HISTORY_SAMPLES = 60;

    private final PortfolioProperties properties;
    private final MeterRegistry meterRegistry;
    private final HttpClient httpClient;

    private final Map<String, TargetState> targetsState = new ConcurrentHashMap<>();
    private final List<String> orderedTargetKeys = new ArrayList<>();

    @org.springframework.beans.factory.annotation.Autowired
    public PortfolioProbeService(PortfolioProperties properties, MeterRegistry meterRegistry) {
        this(properties, meterRegistry, HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build());
    }

    PortfolioProbeService(PortfolioProperties properties, MeterRegistry meterRegistry, HttpClient httpClient) {
        this.properties = properties;
        this.meterRegistry = meterRegistry;
        this.httpClient = httpClient;
        initTargets();
    }

    @PostConstruct
    public synchronized void initTargets() {
        if (properties == null || properties.getTargets() == null) {
            return;
        }

        // Canonical display order: frontend, rust-api, java-api
        List<String> canonicalOrder = List.of("frontend", "rust-api", "java-api");
        Map<String, String> configured = properties.getTargets();

        for (String key : canonicalOrder) {
            String url = configured.get(key);
            if (url == null) {
                // Support relaxed binding camelCase fallback if properties source mapped it
                if ("rust-api".equals(key)) url = configured.get("rustApi");
                else if ("java-api".equals(key)) url = configured.get("javaApi");
            }
            if (url != null) {
                addTarget(key, resolveLabel(key), url);
            }
        }

        // Include any remaining configured targets while preserving their appearance
        for (Map.Entry<String, String> entry : configured.entrySet()) {
            String rawKey = entry.getKey();
            String normalizedKey = normalizeKey(rawKey);
            if (!targetsState.containsKey(normalizedKey)) {
                addTarget(normalizedKey, resolveLabel(normalizedKey), entry.getValue());
            }
        }
    }

    public synchronized void addTarget(String key, String label, String url) {
        if (!targetsState.containsKey(key)) {
            targetsState.put(key, new TargetState(key, label, url));
            orderedTargetKeys.add(key);
        }
    }

    private String normalizeKey(String key) {
        if ("rustApi".equals(key)) return "rust-api";
        if ("javaApi".equals(key)) return "java-api";
        return key;
    }

    private static String resolveLabel(String key) {
        return switch (key) {
            case "frontend" -> "Frontend";
            case "rust-api" -> "Rust API";
            case "java-api" -> "Java API";
            default -> key;
        };
    }

    @Scheduled(fixedDelayString = "${portfolio.probe.interval-ms:60000}", initialDelay = 10000)
    public void probeAll() {
        if (properties == null || !properties.getProbe().isEnabled()) {
            return;
        }

        for (String key : orderedTargetKeys) {
            try {
                probeTarget(key);
            } catch (Exception e) {
                logger.warn("Unexpected exception probing portfolio target {}: {}", key, e.getMessage());
            }
        }
    }

    public void probeTarget(String key) {
        TargetState state = targetsState.get(key);
        if (state == null) {
            return;
        }

        long timeoutMs = properties.getProbe().getTimeoutMs();
        HttpRequest request;
        try {
            request = HttpRequest.newBuilder()
                    .uri(URI.create(state.url))
                    .timeout(Duration.ofMillis(timeoutMs))
                    .GET()
                    .build();
        } catch (Exception e) {
            logger.warn("Invalid URL for portfolio target {}: {}", key, state.url);
            recordDown(state, null, 0L, "invalid URL: " + e.getMessage());
            return;
        }

        long start = System.nanoTime();
        try {
            HttpResponse<Void> response = httpClient.send(request, HttpResponse.BodyHandlers.discarding());
            long latencyMs = (System.nanoTime() - start) / 1_000_000;
            int statusCode = response.statusCode();

            if (statusCode >= 200 && statusCode < 300) {
                recordUp(state, statusCode, latencyMs);
            } else {
                recordDown(state, statusCode, latencyMs, "HTTP " + statusCode);
            }
        } catch (HttpTimeoutException e) {
            long latencyMs = (System.nanoTime() - start) / 1_000_000;
            recordDown(state, null, latencyMs, "timeout after " + timeoutMs + " ms");
        } catch (ConnectException e) {
            long latencyMs = (System.nanoTime() - start) / 1_000_000;
            recordDown(state, null, latencyMs, "connection refused");
        } catch (Exception e) {
            long latencyMs = (System.nanoTime() - start) / 1_000_000;
            String msg = e.getMessage() != null && !e.getMessage().isBlank() ? e.getMessage() : e.getClass().getSimpleName();
            if (msg.contains("\n")) {
                msg = msg.substring(0, msg.indexOf('\n'));
            }
            if (msg.length() > 100) {
                msg = msg.substring(0, 100);
            }
            recordDown(state, null, latencyMs, msg);
        }
    }

    private void recordUp(TargetState state, int statusCode, long latencyMs) {
        Instant now = Instant.now();
        state.up = true;
        state.statusCode = statusCode;
        state.latencyMs = latencyMs;
        state.checkedAt = now;
        state.lastSuccessAt = now;
        state.error = null;

        state.upGauge.set(1);
        state.latencyMsGauge.set(latencyMs);
        state.registerGauges(meterRegistry);

        state.addSample(new PortfolioSampleDto(now, true, latencyMs));
    }

    private void recordDown(TargetState state, Integer statusCode, long latencyMs, String error) {
        Instant now = Instant.now();
        state.up = false;
        state.statusCode = statusCode;
        state.latencyMs = latencyMs;
        state.checkedAt = now;
        // Keep lastSuccessAt across failures
        state.error = error;

        state.upGauge.set(0);
        state.latencyMsGauge.set(latencyMs);
        state.registerGauges(meterRegistry);

        state.addSample(new PortfolioSampleDto(now, false, latencyMs));
    }

    public PortfolioStatusDto getStatus() {
        int intervalSeconds = properties != null ? (int) (properties.getProbe().getIntervalMs() / 1000) : 60;
        List<PortfolioTargetStatusDto> targets = new ArrayList<>();

        for (String key : orderedTargetKeys) {
            TargetState state = targetsState.get(key);
            if (state != null) {
                targets.add(state.toDto());
            }
        }

        return new PortfolioStatusDto(intervalSeconds, targets);
    }

    public TargetState getTargetState(String key) {
        return targetsState.get(key);
    }

    public static class TargetState {
        private final String key;
        private final String label;
        private final String url;

        // Strong references held by TargetState so Micrometer weak-referenced gauges stay valid
        private final AtomicInteger upGauge = new AtomicInteger(0);
        private final AtomicLong latencyMsGauge = new AtomicLong(0);
        private final AtomicBoolean gaugeRegistered = new AtomicBoolean(false);

        private volatile Boolean up = null;
        private volatile Integer statusCode = null;
        private volatile Long latencyMs = null;
        private volatile Instant checkedAt = null;
        private volatile Instant lastSuccessAt = null;
        private volatile String error = null;

        private final ConcurrentLinkedDeque<PortfolioSampleDto> history = new ConcurrentLinkedDeque<>();

        public TargetState(String key, String label, String url) {
            this.key = key;
            this.label = label;
            this.url = url;
        }

        public void registerGauges(MeterRegistry registry) {
            if (registry != null && gaugeRegistered.compareAndSet(false, true)) {
                Gauge.builder("portfolio.probe.up", upGauge, AtomicInteger::get)
                        .tag("target", key)
                        .description("Portfolio target availability (1=up, 0=down)")
                        .register(registry);

                Gauge.builder("portfolio.probe.latency", latencyMsGauge, gauge -> gauge.get() / 1000.0)
                        .baseUnit("seconds")
                        .tag("target", key)
                        .description("Portfolio target probe latency in seconds")
                        .register(registry);
            }
        }

        public void addSample(PortfolioSampleDto sample) {
            history.addLast(sample);
            while (history.size() > MAX_HISTORY_SAMPLES) {
                history.pollFirst();
            }
        }

        public Double calculateUptimePercent() {
            if (history.isEmpty()) {
                return null;
            }
            long upCount = history.stream().filter(PortfolioSampleDto::up).count();
            double pct = ((double) upCount / history.size()) * 100.0;
            return Math.round(pct * 10.0) / 10.0;
        }

        public PortfolioTargetStatusDto toDto() {
            return new PortfolioTargetStatusDto(
                    key,
                    label,
                    url,
                    up,
                    statusCode,
                    latencyMs,
                    checkedAt,
                    lastSuccessAt,
                    error,
                    calculateUptimePercent(),
                    new ArrayList<>(history)
            );
        }

        public Boolean getUp() { return up; }
        public Integer getStatusCode() { return statusCode; }
        public Long getLatencyMs() { return latencyMs; }
        public Instant getCheckedAt() { return checkedAt; }
        public Instant getLastSuccessAt() { return lastSuccessAt; }
        public String getError() { return error; }
        public int getHistorySize() { return history.size(); }
    }
}
