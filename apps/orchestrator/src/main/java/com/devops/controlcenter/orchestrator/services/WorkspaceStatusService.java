package com.devops.controlcenter.orchestrator.services;

import com.devops.controlcenter.orchestrator.config.WorkspaceProperties;
import com.devops.controlcenter.orchestrator.dto.WorkspaceCreditDto;
import com.devops.controlcenter.orchestrator.dto.WorkspaceStatusDto;
import com.devops.controlcenter.orchestrator.dto.WorkspaceSyncDto;
import com.devops.controlcenter.orchestrator.dto.WorkspaceSyncHostDto;
import com.devops.controlcenter.orchestrator.dto.WorkspaceVmDto;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Periodically checks dev workspace status (Linode instance, Linode promo credit,
 * and GitHub memory repo sync commits) and keeps the latest results in memory.
 *
 * Outbound calls happen only on the scheduled timer; read requests return in-memory state.
 */
@Service
public class WorkspaceStatusService {

    private static final Logger logger = LoggerFactory.getLogger(WorkspaceStatusService.class);
    private static final Pattern SYNC_PATTERN = Pattern.compile("^sync: (\\S+) ");

    private final WorkspaceProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final Clock clock;

    private final record HostEntry(String host, String label) {}
    private final List<HostEntry> configuredHosts = new ArrayList<>();

    // VM state
    private volatile String vmState;
    private volatile String vmLabel;
    private volatile String vmStatus;
    private volatile String vmRegion;
    private volatile Instant vmCheckedAt;
    private volatile String vmError;

    // Credit state
    private volatile String creditState;
    private volatile BigDecimal creditRemainingUsd;
    private volatile BigDecimal creditUninvoicedUsd;
    private volatile Instant creditExpiresAt;
    private volatile Instant creditCheckedAt;
    private volatile String creditError;

    // Sync state
    private volatile String syncState;
    private volatile Instant syncCheckedAt;
    private volatile String syncError;
    private volatile List<WorkspaceSyncHostDto> syncHosts = Collections.emptyList();

    @Autowired
    public WorkspaceStatusService(WorkspaceProperties properties, ObjectMapper objectMapper) {
        this(properties, objectMapper, HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                // Requests carry API tokens, which a followed redirect would forward.
                .followRedirects(HttpClient.Redirect.NEVER)
                .build(), Clock.systemUTC());
    }

    WorkspaceStatusService(WorkspaceProperties properties, ObjectMapper objectMapper, HttpClient httpClient, Clock clock) {
        this.properties = properties;
        this.objectMapper = objectMapper != null ? objectMapper : new ObjectMapper();
        this.httpClient = httpClient;
        this.clock = clock != null ? clock : Clock.systemUTC();

        initSyncHosts();
        initStates();
    }

    private void initSyncHosts() {
        configuredHosts.clear();
        if (properties == null || properties.getSyncHosts() == null || properties.getSyncHosts().isBlank()) {
            return;
        }
        String[] parts = properties.getSyncHosts().split(",");
        for (String part : parts) {
            String trimmed = part.trim();
            if (trimmed.isEmpty()) {
                continue;
            }
            int eq = trimmed.indexOf('=');
            if (eq > 0) {
                String host = trimmed.substring(0, eq).trim();
                String label = trimmed.substring(eq + 1).trim();
                configuredHosts.add(new HostEntry(host, label));
            } else {
                configuredHosts.add(new HostEntry(trimmed, trimmed));
            }
        }
    }

    private void initStates() {
        boolean linodeConfigured = properties != null
                && properties.getLinode() != null
                && properties.getLinode().getToken() != null
                && !properties.getLinode().getToken().isBlank();

        if (linodeConfigured) {
            vmState = "pending";
            creditState = "pending";
        } else {
            vmState = "unconfigured";
            creditState = "unconfigured";
        }

        boolean githubConfigured = properties != null
                && properties.getGithub() != null
                && properties.getGithub().getToken() != null
                && !properties.getGithub().getToken().isBlank();

        if (githubConfigured) {
            syncState = "pending";
        } else {
            syncState = "unconfigured";
        }

        List<WorkspaceSyncHostDto> initial = new ArrayList<>();
        for (HostEntry entry : configuredHosts) {
            initial.add(new WorkspaceSyncHostDto(entry.host(), entry.label(), null));
        }
        syncHosts = Collections.unmodifiableList(initial);
    }

    @Scheduled(fixedDelayString = "${workspace.status.interval-ms:300000}", initialDelay = 15000)
    public void refresh() {
        if (properties == null || properties.getStatus() == null || !properties.getStatus().isEnabled()) {
            return;
        }
        refreshVm();
        refreshCredit();
        refreshSync();
    }

    private void refreshVm() {
        if (properties.getLinode() == null
                || properties.getLinode().getToken() == null
                || properties.getLinode().getToken().isBlank()) {
            vmState = "unconfigured";
            vmError = null;
            return;
        }

        try {
            String url = properties.getLinode().getApiUrl() + "/linode/instances/" + properties.getLinode().getInstanceId();
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("Authorization", "Bearer " + properties.getLinode().getToken().trim())
                    .timeout(Duration.ofMillis(properties.getStatus().getTimeoutMs()))
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new RuntimeException();
            }

            JsonNode root = objectMapper.readTree(response.body());
            vmLabel = root.path("label").asText(null);
            vmStatus = root.path("status").asText(null);
            vmRegion = root.path("region").asText(null);
            vmCheckedAt = Instant.now(clock);
            vmError = null;
            vmState = "ok";
        } catch (Exception e) {
            logger.warn("Linode VM check failed: {}", e.getClass().getSimpleName());
            vmState = "error";
            vmError = "Linode API unavailable";
        }
    }

    private void refreshCredit() {
        if (properties.getLinode() == null
                || properties.getLinode().getToken() == null
                || properties.getLinode().getToken().isBlank()) {
            creditState = "unconfigured";
            creditError = null;
            return;
        }

        try {
            String url = properties.getLinode().getApiUrl() + "/account";
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("Authorization", "Bearer " + properties.getLinode().getToken().trim())
                    .timeout(Duration.ofMillis(properties.getStatus().getTimeoutMs()))
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new RuntimeException();
            }

            JsonNode root = objectMapper.readTree(response.body());
            BigDecimal uninvoiced = parseBigDecimal(root.path("balance_uninvoiced"));
            if (uninvoiced == null) {
                uninvoiced = BigDecimal.ZERO;
            }

            BigDecimal totalRemaining = BigDecimal.ZERO;
            Instant earliestExpiry = null;
            JsonNode promotions = root.path("active_promotions");
            if (promotions != null && promotions.isArray() && !promotions.isEmpty()) {
                for (JsonNode promo : promotions) {
                    BigDecimal rem = parseBigDecimal(promo.path("credit_remaining"));
                    if (rem != null) {
                        totalRemaining = totalRemaining.add(rem);
                    }
                    String expireStr = promo.path("expire_dt").asText(null);
                    if (expireStr != null && !expireStr.isBlank()) {
                        Instant exp = parseExpireDt(expireStr);
                        if (exp != null) {
                            if (earliestExpiry == null || exp.isBefore(earliestExpiry)) {
                                earliestExpiry = exp;
                            }
                        }
                    }
                }
            } else {
                totalRemaining = BigDecimal.ZERO;
                earliestExpiry = null;
            }

            creditRemainingUsd = totalRemaining;
            creditUninvoicedUsd = uninvoiced;
            creditExpiresAt = earliestExpiry;
            creditCheckedAt = Instant.now(clock);
            creditError = null;
            creditState = "ok";
        } catch (Exception e) {
            logger.warn("Linode credit check failed: {}", e.getClass().getSimpleName());
            creditState = "error";
            creditError = "Linode API unavailable";
        }
    }

    private void refreshSync() {
        if (properties.getGithub() == null
                || properties.getGithub().getToken() == null
                || properties.getGithub().getToken().isBlank()) {
            syncState = "unconfigured";
            syncError = null;
            return;
        }

        try {
            String url = properties.getGithub().getApiUrl() + "/repos/" + properties.getGithub().getRepo() + "/commits?per_page=100";
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("Authorization", "Bearer " + properties.getGithub().getToken().trim())
                    .header("Accept", "application/vnd.github+json")
                    .header("X-GitHub-Api-Version", "2022-11-28")
                    .timeout(Duration.ofMillis(properties.getStatus().getTimeoutMs()))
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new RuntimeException();
            }

            JsonNode commits = objectMapper.readTree(response.body());
            Map<String, Instant> maxAuthorDatePerHost = new HashMap<>();

            if (commits != null && commits.isArray()) {
                for (JsonNode item : commits) {
                    String message = item.path("commit").path("message").asText("");
                    Matcher matcher = SYNC_PATTERN.matcher(message);
                    if (matcher.find()) {
                        String host = matcher.group(1);
                        if (isHostConfigured(host)) {
                            String dateStr = item.path("commit").path("author").path("date").asText(null);
                            if (dateStr != null && !dateStr.isBlank()) {
                                Instant date = Instant.parse(dateStr.trim());
                                maxAuthorDatePerHost.merge(host, date, (d1, d2) -> d1.isAfter(d2) ? d1 : d2);
                            }
                        }
                    }
                }
            }

            List<WorkspaceSyncHostDto> hostList = new ArrayList<>();
            for (HostEntry entry : configuredHosts) {
                Instant lastChange = maxAuthorDatePerHost.get(entry.host());
                hostList.add(new WorkspaceSyncHostDto(entry.host(), entry.label(), lastChange));
            }

            syncHosts = Collections.unmodifiableList(hostList);
            syncCheckedAt = Instant.now(clock);
            syncError = null;
            syncState = "ok";
        } catch (Exception e) {
            logger.warn("GitHub sync check failed: {}", e.getClass().getSimpleName());
            syncState = "error";
            syncError = "GitHub API unavailable";
        }
    }

    private boolean isHostConfigured(String host) {
        for (HostEntry entry : configuredHosts) {
            if (entry.host().equals(host)) {
                return true;
            }
        }
        return false;
    }

    private BigDecimal parseBigDecimal(JsonNode node) {
        if (node == null || node.isNull() || node.isMissingNode()) {
            return null;
        }
        if (node.isNumber()) {
            return node.decimalValue();
        }
        String text = node.asText();
        if (text == null || text.isBlank()) {
            return null;
        }
        return new BigDecimal(text.trim());
    }

    private Instant parseExpireDt(String str) {
        if (str == null || str.isBlank()) {
            return null;
        }
        String trimmed = str.trim();
        if (trimmed.endsWith("Z") || trimmed.contains("+")) {
            try {
                return Instant.parse(trimmed);
            } catch (Exception ignored) {}
        }
        try {
            return LocalDateTime.parse(trimmed, DateTimeFormatter.ISO_LOCAL_DATE_TIME).toInstant(ZoneOffset.UTC);
        } catch (Exception e) {
            return LocalDateTime.parse(trimmed).toInstant(ZoneOffset.UTC);
        }
    }

    public WorkspaceStatusDto getStatus() {
        Integer daysLeft = null;
        if (creditExpiresAt != null) {
            long days = Duration.between(clock.instant(), creditExpiresAt).toDays();
            daysLeft = (int) Math.max(0, days);
        }

        WorkspaceVmDto vm = new WorkspaceVmDto(
                vmState,
                vmLabel,
                vmStatus,
                vmRegion,
                vmCheckedAt,
                vmError
        );

        WorkspaceCreditDto credit = new WorkspaceCreditDto(
                creditState,
                creditRemainingUsd,
                creditUninvoicedUsd,
                creditExpiresAt,
                daysLeft,
                creditCheckedAt,
                creditError
        );

        WorkspaceSyncDto sync = new WorkspaceSyncDto(
                syncState,
                syncCheckedAt,
                syncError,
                syncHosts
        );

        return new WorkspaceStatusDto(vm, credit, sync);
    }
}
