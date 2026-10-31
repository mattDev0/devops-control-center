package com.devops.controlcenter.orchestrator.services;

import com.devops.controlcenter.orchestrator.config.WorkspaceProperties;
import com.devops.controlcenter.orchestrator.dto.WorkspaceStatusDto;
import com.devops.controlcenter.orchestrator.services.WorkspaceStatusService;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

class WorkspaceStatusServiceTest {

    private HttpServer server;
    private String baseUrl;
    private ObjectMapper objectMapper;
    private WorkspaceProperties properties;
    private WorkspaceStatusService service;
    private Clock fixedClock;

    private final AtomicInteger linodeVmStatus = new AtomicInteger(200);
    private final AtomicReference<String> linodeVmBody = new AtomicReference<>("");
    private final AtomicInteger linodeAccountStatus = new AtomicInteger(200);
    private final AtomicReference<String> linodeAccountBody = new AtomicReference<>("");
    private final AtomicInteger githubStatus = new AtomicInteger(200);
    private final AtomicReference<String> githubBody = new AtomicReference<>("");

    private final AtomicReference<String> lastLinodeAuthHeader = new AtomicReference<>("");
    private final AtomicReference<String> lastGithubAuthHeader = new AtomicReference<>("");
    private final AtomicReference<String> lastGithubAcceptHeader = new AtomicReference<>("");
    private final AtomicReference<String> lastGithubApiVersionHeader = new AtomicReference<>("");
    private final AtomicInteger totalRequestCount = new AtomicInteger(0);

    private static final String REALISTIC_VM_FIXTURE = """
        {
          "label": "dev-workspace",
          "status": "running",
          "region": "gb-lon"
        }
        """;

    private static final String REALISTIC_ACCOUNT_FIXTURE = """
        {
          "balance_uninvoiced": "12.30",
          "email": "personal-email@example.com",
          "address_1": "123 Private Street",
          "active_promotions": [
            {
              "credit_remaining": "50.00",
              "expire_dt": "2027-01-01T04:59:59"
            },
            {
              "credit_remaining": "48.50",
              "expire_dt": "2027-02-01T04:59:59"
            }
          ]
        }
        """;

    private static final String REALISTIC_COMMITS_FIXTURE = """
        [
          {
            "commit": {
              "message": "sync: dev-workspace save 2",
              "author": { "date": "2026-10-31T06:00:00Z" },
              "committer": { "date": "2026-10-31T07:00:00Z" }
            }
          },
          {
            "commit": {
              "message": "sync: dev-workspace save 1",
              "author": { "date": "2026-10-31T05:00:00Z" },
              "committer": { "date": "2026-10-31T05:30:00Z" }
            }
          },
          {
            "commit": {
              "message": "sync: unknown-host something",
              "author": { "date": "2026-10-31T06:30:00Z" },
              "committer": { "date": "2026-10-31T06:30:00Z" }
            }
          },
          {
            "commit": {
              "message": "chore: regular commit without sync prefix",
              "author": { "date": "2026-10-31T06:45:00Z" },
              "committer": { "date": "2026-10-31T06:45:00Z" }
            }
          }
        ]
        """;

    @BeforeEach
    void setUp() throws IOException {
        objectMapper = new ObjectMapper();
        fixedClock = Clock.fixed(Instant.parse("2026-10-31T00:00:00Z"), ZoneOffset.UTC);

        linodeVmStatus.set(200);
        linodeVmBody.set(REALISTIC_VM_FIXTURE);
        linodeAccountStatus.set(200);
        linodeAccountBody.set(REALISTIC_ACCOUNT_FIXTURE);
        githubStatus.set(200);
        githubBody.set(REALISTIC_COMMITS_FIXTURE);
        totalRequestCount.set(0);

        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);

        server.createContext("/linode/instances/109711421", exchange -> {
            totalRequestCount.incrementAndGet();
            lastLinodeAuthHeader.set(exchange.getRequestHeaders().getFirst("Authorization"));
            int code = linodeVmStatus.get();
            byte[] bytes = linodeVmBody.get().getBytes();
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(code, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });

        server.createContext("/account", exchange -> {
            totalRequestCount.incrementAndGet();
            lastLinodeAuthHeader.set(exchange.getRequestHeaders().getFirst("Authorization"));
            int code = linodeAccountStatus.get();
            byte[] bytes = linodeAccountBody.get().getBytes();
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(code, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });

        server.createContext("/repos/mattDev0/agent-memory/commits", exchange -> {
            totalRequestCount.incrementAndGet();
            lastGithubAuthHeader.set(exchange.getRequestHeaders().getFirst("Authorization"));
            lastGithubAcceptHeader.set(exchange.getRequestHeaders().getFirst("Accept"));
            lastGithubApiVersionHeader.set(exchange.getRequestHeaders().getFirst("X-GitHub-Api-Version"));
            int code = githubStatus.get();
            byte[] bytes = githubBody.get().getBytes();
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(code, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });

        server.start();
        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();

        properties = new WorkspaceProperties();
        properties.getStatus().setEnabled(true);
        properties.getStatus().setIntervalMs(300000);
        properties.getStatus().setTimeoutMs(5000);
        properties.getLinode().setApiUrl(baseUrl);
        properties.getLinode().setToken("test-linode-token");
        properties.getLinode().setInstanceId("109711421");
        properties.getGithub().setApiUrl(baseUrl);
        properties.getGithub().setToken("test-github-token");
        properties.getGithub().setRepo("mattDev0/agent-memory");
        properties.setSyncHosts("matt-PC=Laptop (WSL),dev-workspace=Workspace VM");

        HttpClient httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(2))
                .build();
        service = new WorkspaceStatusService(properties, objectMapper, httpClient, fixedClock);
    }

    @AfterEach
    void tearDown() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void allThreeSectionsParseFromRealisticFixtures() {
        service.refresh();
        WorkspaceStatusDto status = service.getStatus();

        // VM
        assertEquals("ok", status.vm().state());
        assertEquals("dev-workspace", status.vm().label());
        assertEquals("running", status.vm().status());
        assertEquals("gb-lon", status.vm().region());
        assertNotNull(status.vm().checkedAt());
        assertNull(status.vm().error());

        // Credit
        assertEquals("ok", status.credit().state());
        assertEquals(new BigDecimal("98.50"), status.credit().remainingUsd());
        assertEquals(new BigDecimal("12.30"), status.credit().uninvoicedUsd());
        assertEquals(Instant.parse("2027-01-01T04:59:59Z"), status.credit().expiresAt());
        assertEquals(62, status.credit().daysLeft());
        assertNotNull(status.credit().checkedAt());
        assertNull(status.credit().error());

        // Sync
        assertEquals("ok", status.sync().state());
        assertNotNull(status.sync().checkedAt());
        assertNull(status.sync().error());
        assertEquals(2, status.sync().hosts().size());

        assertEquals("matt-PC", status.sync().hosts().get(0).host());
        assertEquals("Laptop (WSL)", status.sync().hosts().get(0).label());
        assertNull(status.sync().hosts().get(0).lastChangeAt());

        assertEquals("dev-workspace", status.sync().hosts().get(1).host());
        assertEquals("Workspace VM", status.sync().hosts().get(1).label());
        assertEquals(Instant.parse("2026-10-31T06:00:00Z"), status.sync().hosts().get(1).lastChangeAt());
    }

    @Test
    void authorizationHeaderSentAndBlankTokenGivesUnconfigured() {
        service.refresh();
        assertEquals("Bearer test-linode-token", lastLinodeAuthHeader.get());
        assertEquals("Bearer test-github-token", lastGithubAuthHeader.get());
        assertEquals("application/vnd.github+json", lastGithubAcceptHeader.get());
        assertEquals("2022-11-28", lastGithubApiVersionHeader.get());

        // Blank tokens
        WorkspaceProperties blankProps = new WorkspaceProperties();
        blankProps.getLinode().setToken("");
        blankProps.getGithub().setToken("   ");
        blankProps.getLinode().setApiUrl(baseUrl);
        blankProps.getGithub().setApiUrl(baseUrl);

        totalRequestCount.set(0);
        WorkspaceStatusService blankService = new WorkspaceStatusService(blankProps, objectMapper, HttpClient.newHttpClient(), fixedClock);
        blankService.refresh();

        assertEquals(0, totalRequestCount.get());
        WorkspaceStatusDto status = blankService.getStatus();
        assertEquals("unconfigured", status.vm().state());
        assertEquals("unconfigured", status.credit().state());
        assertEquals("unconfigured", status.sync().state());
    }

    @Test
    void linodeFailureLeavesSyncIntactAndKeepsLastGoodValues() {
        service.refresh();
        WorkspaceStatusDto first = service.getStatus();
        assertEquals("ok", first.vm().state());
        assertEquals("ok", first.credit().state());
        assertEquals("ok", first.sync().state());

        // Linode returns 500 with sensitive body
        linodeVmStatus.set(500);
        linodeVmBody.set("{\"errors\": [{\"reason\": \"Internal database crashed on host 10.0.0.1\"}]}");
        linodeAccountStatus.set(500);
        linodeAccountBody.set("{\"errors\": [{\"reason\": \"Database timeout on master\"}]}");

        service.refresh();
        WorkspaceStatusDto second = service.getStatus();

        // Sync intact
        assertEquals("ok", second.sync().state());
        assertNull(second.sync().error());
        assertEquals(first.sync().checkedAt(), second.sync().checkedAt());

        // VM error with last good values preserved
        assertEquals("error", second.vm().state());
        assertEquals("dev-workspace", second.vm().label());
        assertEquals("running", second.vm().status());
        assertEquals("gb-lon", second.vm().region());
        assertEquals(first.vm().checkedAt(), second.vm().checkedAt());
        assertEquals("Linode API unavailable", second.vm().error());
        assertFalse(second.vm().error().contains("Internal database"));

        // Credit error with last good values preserved
        assertEquals("error", second.credit().state());
        assertEquals(new BigDecimal("98.50"), second.credit().remainingUsd());
        assertEquals(new BigDecimal("12.30"), second.credit().uninvoicedUsd());
        assertEquals(Instant.parse("2027-01-01T04:59:59Z"), second.credit().expiresAt());
        assertEquals(first.credit().checkedAt(), second.credit().checkedAt());
        assertEquals("Linode API unavailable", second.credit().error());
        assertFalse(second.credit().error().contains("timeout"));
    }

    @Test
    void accountPersonalDataNotInSerializedResponse() throws Exception {
        service.refresh();
        WorkspaceStatusDto status = service.getStatus();
        String json = objectMapper.writeValueAsString(status);

        assertFalse(json.contains("personal-email@example.com"));
        assertFalse(json.contains("123 Private Street"));
    }

    @Test
    void nonSyncCommitsAndUnknownHostsIgnoredAndAuthorDateUsed() {
        service.refresh();
        WorkspaceStatusDto status = service.getStatus();

        // Unknown host not in hosts
        boolean hasUnknown = status.sync().hosts().stream().anyMatch(h -> "unknown-host".equals(h.host()));
        assertFalse(hasUnknown);

        // Host with no sync commits in window has null lastChangeAt
        assertEquals("matt-PC", status.sync().hosts().get(0).host());
        assertNull(status.sync().hosts().get(0).lastChangeAt());

        // dev-workspace author.date 2026-10-31T06:00:00Z used (committer date was 07:00:00Z)
        assertEquals("dev-workspace", status.sync().hosts().get(1).host());
        assertEquals(Instant.parse("2026-10-31T06:00:00Z"), status.sync().hosts().get(1).lastChangeAt());
    }

    @Test
    void daysLeftWithClockAndNeverNegative() {
        // Clock past expiry: 2027-02-01T00:00:00Z
        Clock futureClock = Clock.fixed(Instant.parse("2027-02-01T00:00:00Z"), ZoneOffset.UTC);
        WorkspaceStatusService futureService = new WorkspaceStatusService(properties, objectMapper, HttpClient.newHttpClient(), futureClock);
        futureService.refresh();

        WorkspaceStatusDto futureStatus = futureService.getStatus();
        assertEquals(0, futureStatus.credit().daysLeft());

        // No promotions fixture
        linodeAccountBody.set("""
            {
              "balance_uninvoiced": "5.00",
              "active_promotions": []
            }
            """);
        service.refresh();
        WorkspaceStatusDto noPromoStatus = service.getStatus();
        assertEquals(BigDecimal.ZERO, noPromoStatus.credit().remainingUsd());
        assertNull(noPromoStatus.credit().expiresAt());
        assertNull(noPromoStatus.credit().daysLeft());
    }
}
