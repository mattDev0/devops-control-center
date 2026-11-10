package com.devops.controlcenter.orchestrator.services;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class GithubService {

    private static final Logger logger = LoggerFactory.getLogger(GithubService.class);

    public static final java.util.regex.Pattern WORKFLOW_ID_PATTERN =
            java.util.regex.Pattern.compile("^([A-Za-z0-9_.-]{1,100}:)?[A-Za-z0-9_.-]{1,100}$");

    private final RestClient restClient;
    
    @Value("${github.owner:mattDev0}")
    private String owner = "mattDev0";
    
    @Value("${github.repo:portfolio-monorepo}")
    private String repo = "portfolio-monorepo";

    public GithubService(
            RestClient.Builder restClientBuilder,
            @Value("${github.token:}") String githubToken,
            @Value("${github.api-url:https://api.github.com}") String apiUrl,
            @Value("${outbound.connect-timeout-ms:3000}") long connectTimeoutMs,
            @Value("${outbound.read-timeout-ms:10000}") long readTimeoutMs) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofMillis(connectTimeoutMs));
        requestFactory.setReadTimeout(Duration.ofMillis(readTimeoutMs));

        RestClient.Builder builder = restClientBuilder
                .baseUrl(apiUrl)
                .defaultHeader("Accept", "application/vnd.github.v3+json")
                .requestFactory(requestFactory);
        
        if (githubToken != null && !githubToken.trim().isEmpty() && !githubToken.trim().startsWith("ghs_")) {
            builder.defaultHeader("Authorization", "Bearer " + githubToken.trim());
        }
        
        this.restClient = builder.build();
    }

    public List<Map<String, Object>> getRecentWorkflows() {
        List<Map<String, Object>> allRuns = new java.util.ArrayList<>();
        String[] repos = {"portfolio-monorepo", "devops-control-center"};

        for (String r : repos) {
            try {
                Map<String, Object> response = this.restClient.get()
                        .uri("/repos/" + owner + "/" + r + "/actions/runs?per_page=5")
                        .retrieve()
                        .body(Map.class);

                if (response != null && response.containsKey("workflow_runs")) {
                    List<Map<String, Object>> runs = (List<Map<String, Object>>) response.get("workflow_runs");
                    for (Map<String, Object> run : runs) {
                        Map<String, Object> headCommit = (Map<String, Object>) run.get("head_commit");
                        
                        Object workflowId = run.get("workflow_id");
                        String idStr = r + ":" + (workflowId != null ? workflowId.toString() : "");
                        
                        String runName = run.get("name") != null ? run.get("name").toString() : "Workflow";
                        String displayName = "[" + r + "] " + runName;

                        // Create mutable map or use Map.of if values are non-null
                        String createdAt = run.get("created_at") != null ? run.get("created_at").toString() : "";
                        
                        java.util.Map<String, Object> runMap = new java.util.HashMap<>();
                        runMap.put("id", idStr);
                        runMap.put("name", displayName);
                        runMap.put("status", run.get("status"));
                        runMap.put("conclusion", run.get("conclusion") != null ? run.get("conclusion") : "null");
                        runMap.put("branch", run.get("head_branch"));
                        runMap.put("commitMsg", headCommit != null ? headCommit.get("message") : "N/A");
                        runMap.put("createdAt", createdAt);
                        
                        allRuns.add(runMap);
                    }
                }
            } catch (Exception e) {
                logger.error("Failed to fetch GitHub workflows for {}: {}", r, e.getMessage());
            }
        }

        // Sort by createdAt descending
        allRuns.sort((a, b) -> {
            String c1 = a.get("createdAt") != null ? a.get("createdAt").toString() : "";
            String c2 = b.get("createdAt") != null ? b.get("createdAt").toString() : "";
            return c2.compareTo(c1);
        });

        return allRuns.stream().limit(5).collect(Collectors.toList());
    }

    public void triggerWorkflow(String workflowId) {
        try {
            String targetRepo = this.repo;
            String targetWorkflowId = workflowId;

            if (workflowId.contains(":")) {
                String[] parts = workflowId.split(":", 2);
                targetRepo = parts[0];
                targetWorkflowId = parts[1];
            }

            this.restClient.post()
                    .uri("/repos/" + owner + "/" + targetRepo + "/actions/workflows/" + targetWorkflowId + "/dispatches")
                    .body(Map.of("ref", "main"))
                    .retrieve()
                    .toBodilessEntity();
            logger.info("Triggered GitHub Action workflow ID: {} in repo: {}", targetWorkflowId, targetRepo);
        } catch (Exception e) {
            logger.error("Failed to trigger GitHub workflow: {}", e.getMessage());
            throw new IllegalStateException("GitHub workflow dispatch failed", e);
        }
    }
}
