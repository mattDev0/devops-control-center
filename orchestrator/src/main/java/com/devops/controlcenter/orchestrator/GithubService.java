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
        this.restClient = restClientBuilder
                .baseUrl("https://api.github.com")
                .defaultHeader("Authorization", "Bearer " + githubToken)
                .defaultHeader("Accept", "application/vnd.github.v3+json")
                .build();
    }

    public List<Map<String, Object>> getRecentWorkflows() {
        try {
            Map<String, Object> response = this.restClient.get()
                    .uri("/repos/" + owner + "/" + repo + "/actions/runs?per_page=5")
                    .retrieve()
                    .body(Map.class);

            if (response != null && response.containsKey("workflow_runs")) {
                List<Map<String, Object>> runs = (List<Map<String, Object>>) response.get("workflow_runs");
                return runs.stream().map(run -> {
                    Map<String, Object> headCommit = (Map<String, Object>) run.get("head_commit");
                    return Map.of(
                            "id", run.get("id"),
                            "name", run.get("name"),
                            "status", run.get("status"),
                            "conclusion", run.get("conclusion") != null ? run.get("conclusion") : "null",
                            "branch", run.get("head_branch"),
                            "commitMsg", headCommit != null ? headCommit.get("message") : "N/A"
                    );
                }).collect(Collectors.toList());
            }
        } catch (Exception e) {
            System.err.println("Failed to fetch GitHub workflows: " + e.getMessage());
        }
        return List.of();
    }

    public void triggerWorkflow(String workflowId) {
        try {
            this.restClient.post()
                    .uri("/repos/" + owner + "/" + repo + "/actions/workflows/" + workflowId + "/dispatches")
                    .body(Map.of("ref", "main"))
                    .retrieve()
                    .toBodilessEntity();
            System.out.println("🚀 Triggered GitHub Action workflow ID: " + workflowId);
        } catch (Exception e) {
            System.err.println("Failed to trigger GitHub workflow: " + e.getMessage());
        }
    }
}
