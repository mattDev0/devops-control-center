package com.devops.controlcenter.orchestrator;

import com.devops.controlcenter.orchestrator.config.PortfolioProperties;
import com.devops.controlcenter.orchestrator.dto.PortfolioStatusDto;
import com.devops.controlcenter.orchestrator.dto.PortfolioTargetStatusDto;
import com.devops.controlcenter.orchestrator.services.PortfolioProbeService;
import com.sun.net.httpserver.HttpServer;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

class PortfolioProbeServiceTest {

    private HttpServer server;
    private String serverUrl;
    private SimpleMeterRegistry meterRegistry;
    private PortfolioProperties properties;
    private PortfolioProbeService service;

    private final AtomicInteger responseCode = new AtomicInteger(200);
    private final AtomicInteger sleepDelayMs = new AtomicInteger(0);

    @BeforeEach
    void setUp() throws IOException {
        meterRegistry = new SimpleMeterRegistry();
        properties = new PortfolioProperties();
        properties.getProbe().setEnabled(true);
        properties.getProbe().setIntervalMs(60000);
        properties.getProbe().setTimeoutMs(10000);

        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/test", exchange -> {
            int delay = sleepDelayMs.get();
            if (delay > 0) {
                try {
                    Thread.sleep(delay);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
            int code = responseCode.get();
            byte[] response = (code == 200 ? "OK" : "Error").getBytes();
            exchange.sendResponseHeaders(code, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        server.start();
        serverUrl = "http://127.0.0.1:" + server.getAddress().getPort() + "/test";

        properties.getTargets().put("rust-api", serverUrl);
        service = new PortfolioProbeService(properties, meterRegistry);
    }

    @AfterEach
    void tearDown() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void probeSuccessRecordsUpAndMetrics() {
        responseCode.set(200);
        service.probeTarget("rust-api");

        PortfolioTargetStatusDto target = service.getStatus().targets().stream()
                .filter(t -> "rust-api".equals(t.key()))
                .findFirst().orElseThrow();

        assertTrue(target.up());
        assertEquals(200, target.statusCode());
        assertNotNull(target.latencyMs());
        assertTrue(target.latencyMs() >= 0);
        assertNotNull(target.checkedAt());
        assertNotNull(target.lastSuccessAt());
        assertNull(target.error());
        assertEquals(100.0, target.uptimePercent());
        assertEquals(1, target.history().size());

        double upGauge = meterRegistry.find("portfolio.probe.up")
                .tag("target", "rust-api")
                .gauge().value();
        assertEquals(1.0, upGauge);

        double latencyGauge = meterRegistry.find("portfolio.probe.latency")
                .tag("target", "rust-api")
                .gauge().value();
        assertTrue(latencyGauge >= 0.0);
    }

    @Test
    void probeFailureKeepsLastSuccessAt() {
        responseCode.set(200);
        service.probeTarget("rust-api");

        PortfolioTargetStatusDto first = service.getStatus().targets().stream()
                .filter(t -> "rust-api".equals(t.key()))
                .findFirst().orElseThrow();
        Instant firstSuccess = first.lastSuccessAt();
        assertNotNull(firstSuccess);

        responseCode.set(503);
        service.probeTarget("rust-api");

        PortfolioTargetStatusDto second = service.getStatus().targets().stream()
                .filter(t -> "rust-api".equals(t.key()))
                .findFirst().orElseThrow();

        assertFalse(second.up());
        assertEquals(503, second.statusCode());
        assertEquals("HTTP 503", second.error());
        assertEquals(firstSuccess, second.lastSuccessAt());
        assertEquals(50.0, second.uptimePercent());
        assertEquals(2, second.history().size());

        double upGauge = meterRegistry.find("portfolio.probe.up")
                .tag("target", "rust-api")
                .gauge().value();
        assertEquals(0.0, upGauge);
    }

    @Test
    void probeTimeoutRecordsDownWithNullStatusCode() {
        properties.getProbe().setTimeoutMs(200);
        sleepDelayMs.set(1000);

        service.probeTarget("rust-api");

        PortfolioTargetStatusDto target = service.getStatus().targets().stream()
                .filter(t -> "rust-api".equals(t.key()))
                .findFirst().orElseThrow();

        assertFalse(target.up());
        assertNull(target.statusCode());
        assertTrue(target.error().contains("timeout after 200 ms"));
    }

    @Test
    void probeConnectionRefusedRecordsDown() throws IOException {
        int closedPort;
        try (ServerSocket socket = new ServerSocket(0)) {
            closedPort = socket.getLocalPort();
        }

        service.addTarget("closed-target", "Closed Target", "http://127.0.0.1:" + closedPort + "/health");
        service.probeTarget("closed-target");

        PortfolioTargetStatusDto target = service.getStatus().targets().stream()
                .filter(t -> "closed-target".equals(t.key()))
                .findFirst().orElseThrow();

        assertFalse(target.up());
        assertNull(target.statusCode());
        assertEquals("connection refused", target.error());
    }

    @Test
    void historyCappedAtSixtyAndUptimePercentCalculatedCorrectly() {
        responseCode.set(200);
        service.probeTarget("rust-api");
        service.probeTarget("rust-api");
        service.probeTarget("rust-api");

        responseCode.set(503);
        service.probeTarget("rust-api");

        PortfolioTargetStatusDto target = service.getStatus().targets().stream()
                .filter(t -> "rust-api".equals(t.key()))
                .findFirst().orElseThrow();
        assertEquals(75.0, target.uptimePercent());
        assertEquals(4, target.history().size());

        responseCode.set(200);
        for (int i = 0; i < 65; i++) {
            service.probeTarget("rust-api");
        }

        PortfolioTargetStatusDto capped = service.getStatus().targets().stream()
                .filter(t -> "rust-api".equals(t.key()))
                .findFirst().orElseThrow();
        assertEquals(60, capped.history().size());
        assertEquals(100.0, capped.uptimePercent());
    }

    @Test
    void unprobedTargetsHaveNullFieldsAndEmptyHistory() {
        PortfolioStatusDto status = service.getStatus();
        assertNotNull(status);
        assertEquals(60, status.intervalSeconds());

        PortfolioTargetStatusDto target = status.targets().stream()
                .filter(t -> "rust-api".equals(t.key()))
                .findFirst().orElseThrow();

        assertNull(target.up());
        assertNull(target.statusCode());
        assertNull(target.latencyMs());
        assertNull(target.checkedAt());
        assertNull(target.lastSuccessAt());
        assertNull(target.error());
        assertNull(target.uptimePercent());
        assertTrue(target.history().isEmpty());
    }
}
