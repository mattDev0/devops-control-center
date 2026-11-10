package com.devops.controlcenter.orchestrator;

import com.devops.controlcenter.orchestrator.services.GithubService;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

class GithubServiceDispatchTest {

    private HttpServer server;
    private String serverUrl;

    @BeforeEach
    void setUp() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    }

    @AfterEach
    void tearDown() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void triggerWorkflowThrowsIllegalStateExceptionOn422() {
        server.createContext("/", exchange -> {
            exchange.sendResponseHeaders(422, -1);
            exchange.close();
        });
        server.start();
        serverUrl = "http://127.0.0.1:" + server.getAddress().getPort();

        GithubService githubService = new GithubService(RestClient.builder(), "", serverUrl, 1000, 1000);

        assertThrows(IllegalStateException.class, () -> {
            githubService.triggerWorkflow("portfolio-monorepo:123");
        });
    }

    @Test
    void triggerWorkflowSucceedsOn204AndPostsToCorrectPath() {
        AtomicReference<String> requestedPath = new AtomicReference<>();
        AtomicReference<String> requestedMethod = new AtomicReference<>();

        server.createContext("/", exchange -> {
            requestedMethod.set(exchange.getRequestMethod());
            requestedPath.set(exchange.getRequestURI().getPath());
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
        });
        server.start();
        serverUrl = "http://127.0.0.1:" + server.getAddress().getPort();

        GithubService githubService = new GithubService(RestClient.builder(), "", serverUrl, 1000, 1000);

        assertDoesNotThrow(() -> {
            githubService.triggerWorkflow("portfolio-monorepo:123");
        });

        assertEquals("POST", requestedMethod.get());
        assertNotNull(requestedPath.get());
        assertTrue(requestedPath.get().endsWith("/actions/workflows/123/dispatches"));
    }

    @Test
    void triggerWorkflowTimesOutWhenServerSleeps() {
        server.createContext("/", exchange -> {
            try {
                Thread.sleep(3000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
        });
        server.start();
        serverUrl = "http://127.0.0.1:" + server.getAddress().getPort();

        GithubService githubService = new GithubService(RestClient.builder(), "", serverUrl, 1000, 1000);

        assertTimeoutPreemptively(Duration.ofSeconds(2), () -> {
            assertThrows(IllegalStateException.class, () -> {
                githubService.triggerWorkflow("portfolio-monorepo:123");
            });
        });
    }
}
