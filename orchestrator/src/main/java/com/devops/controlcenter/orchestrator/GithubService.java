package com.devops.controlcenter.orchestrator;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class GithubService {

    private final RestClient restClient;
    
    @Value("${github.owner:mattDev0}")
    private String owner;
    
    @Value("${github.repo:portfolio-monorepo}")
    private String repo;

    public GithubService(RestClient.Builder restClientBuilder, @Value("${github.token:}") String githubToken) {
        RestClient.Builder builder = restClientBuilder
                .baseUrl("https://api.github.com")
                .defaultHeader("Accept", "application/vnd.github.v3+json");
        
        if (githubToken != null && !githubToken.trim().isEmpty()) {
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
                System.err.println("Failed to fetch GitHub workflows for " + r + ": " + e.getMessage());
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
            System.out.println("🚀 Triggered GitHub Action workflow ID: " + targetWorkflowId + " in repo: " + targetRepo);
        } catch (Exception e) {
            System.err.println("Failed to trigger GitHub workflow: " + e.getMessage());
        }
    }
}
