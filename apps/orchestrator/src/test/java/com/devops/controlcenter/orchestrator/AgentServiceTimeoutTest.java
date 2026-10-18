package com.devops.controlcenter.orchestrator;

import com.devops.controlcenter.orchestrator.exceptions.AgentUnreachableException;
import com.devops.controlcenter.orchestrator.services.AgentService;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;

class AgentServiceTimeoutTest {

    private HttpServer server;
    private String serverUrl;

    @BeforeEach
    void setUp() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/health", exchange -> {
            try {
                // Sleep 3 seconds, which exceeds the 500ms read timeout
                Thread.sleep(3000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            byte[] response = "{\"status\":\"healthy\"}".getBytes();
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        server.start();
        serverUrl = "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @AfterEach
    void tearDown() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void fetchAgentHealthTimesOutAndThrowsAgentUnreachableException() {
        AgentService agentService = new AgentService(
                RestClient.builder(),
                serverUrl,
                "dummy-key",
                1000L,
                500L
        );

        assertTimeoutPreemptively(Duration.ofSeconds(2), () -> {
            assertThrows(AgentUnreachableException.class, agentService::fetchAgentHealth);
        });
    }
}
