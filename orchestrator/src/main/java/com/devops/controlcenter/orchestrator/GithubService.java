package com.devops.controlcenter.orchestrator;

import org.springframework.stereotype.Service;
import java.util.List;
import java.util.Map;

@Service
public class GithubService {

    // In a real application, you would inject a RestClient here configured with:
    // .baseUrl("https://api.github.com")
    // .defaultHeader("Authorization", "Bearer YOUR_GITHUB_PERSONAL_ACCESS_TOKEN")

    public List<Map<String, Object>> getRecentWorkflows() {
        // Returning mock data for UI testing.
        // Once you have a GitHub token, you can fetch from:
        // /repos/{owner}/{repo}/actions/runs
        return List.of(
            Map.of("id", 101, "name", "Production Build & Deploy", "status", "completed", "conclusion", "success", "branch", "main", "commitMsg", "feat: merge docker updates"),
            Map.of("id", 102, "name", "Run Unit Tests", "status", "in_progress", "conclusion", "null", "branch", "feature/auth", "commitMsg", "fix: resolve login bug"),
            Map.of("id", 103, "name", "Code Linter", "status", "completed", "conclusion", "failure", "branch", "main", "commitMsg", "chore: clean up css")
        );
    }

    public void triggerWorkflow(String workflowId) {
        // Here you would make a POST request to:
        // /repos/{owner}/{repo}/actions/workflows/{workflowId}/dispatches
        System.out.println("🚀 Triggered GitHub Action workflow ID: " + workflowId);
    }
}