package com.devops.controlcenter.orchestrator;

import com.devops.controlcenter.orchestrator.security.JwtUtil;
import com.devops.controlcenter.orchestrator.security.RateLimitFilter;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
    "management.endpoints.web.exposure.include=health,prometheus",
    "management.endpoint.health.show-details=always",
    "agent.secret-key=test-agent-secret-key-123",
    "admin.password=test-only-password",
    "jwt.secret=test-only-jwt-signing-secret-not-used-in-production"
})
@AutoConfigureMockMvc
@org.springframework.boot.test.autoconfigure.actuate.observability.AutoConfigureObservability
public class OrchestratorSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtUtil jwtUtil;

    @Autowired
    private RateLimitFilter rateLimitFilter;

    @Autowired
    private ObjectMapper objectMapper;

    @BeforeEach
    public void setUp() {
        rateLimitFilter.reset();
    }

    @Test
    public void testJwtUtilTokenLifecycle() {
        String token = jwtUtil.generateToken("testuser", "ROLE_ADMIN");
        assertNotNull(token);
        assertTrue(jwtUtil.validateToken(token));
        assertEquals("testuser", jwtUtil.getUsernameFromToken(token));
        assertEquals("ROLE_ADMIN", jwtUtil.getRoleFromToken(token));
    }

    @Test
    public void testAuthGuestFlow() throws Exception {
        mockMvc.perform(post("/api/auth/guest"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").exists())
                .andExpect(jsonPath("$.role").value("ROLE_GUEST"));
    }

    @Test
    public void testAuthLoginFlowSuccess() throws Exception {
        Map<String, String> payload = Map.of("username", "admin", "password", "test-only-password");
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").exists())
                .andExpect(jsonPath("$.role").value("ROLE_ADMIN"));
    }

    @Test
    public void testAuthLoginFlowFailure() throws Exception {
        Map<String, String> payload = Map.of("username", "admin", "password", "wrongpassword");
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    public void testActuatorPermitAll() throws Exception {
        mockMvc.perform(get("/actuator/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").exists());
        
        mockMvc.perform(get("/actuator/prometheus"))
                .andExpect(status().isOk());
    }

    @Test
    public void testRateLimitingOnLogin() throws Exception {
        Map<String, String> payload = Map.of("username", "admin", "password", "wrongpassword");
        
        // Make 5 requests within the limit
        for (int i = 0; i < 5; i++) {
            mockMvc.perform(post("/api/auth/login")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(payload)))
                    .andExpect(status().isUnauthorized());
        }

        // The 6th request should be rate limited and return 429
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.error").value("Too many requests. Please try again later."));
    }

    @Test
    public void testGuestCannotStopDockerContainer() throws Exception {
        String guestToken = jwtUtil.generateToken("u", "ROLE_GUEST");
        mockMvc.perform(post("/api/servers/docker/containers/abc123/stop")
                        .header("Authorization", "Bearer " + guestToken))
                .andExpect(status().isForbidden());
    }

    @Test
    public void testGuestCannotStartDockerContainer() throws Exception {
        String guestToken = jwtUtil.generateToken("u", "ROLE_GUEST");
        mockMvc.perform(post("/api/servers/docker/containers/abc123/start")
                        .header("Authorization", "Bearer " + guestToken))
                .andExpect(status().isForbidden());
    }

    @Test
    public void testGuestCannotRestartDockerContainer() throws Exception {
        String guestToken = jwtUtil.generateToken("u", "ROLE_GUEST");
        mockMvc.perform(post("/api/servers/docker/containers/abc123/restart")
                        .header("Authorization", "Bearer " + guestToken))
                .andExpect(status().isForbidden());
    }

    @Test
    public void testAnonymousCannotStopDockerContainer() throws Exception {
        mockMvc.perform(post("/api/servers/docker/containers/abc123/stop"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    public void testGuestCannotExecuteDeploymentAction() throws Exception {
        String guestToken = jwtUtil.generateToken("u", "ROLE_GUEST");
        mockMvc.perform(post("/api/servers/deployments/devops:devops-agent/stop")
                        .header("Authorization", "Bearer " + guestToken))
                .andExpect(status().isForbidden());
    }

    @Test
    public void testGuestCannotTriggerWorkflow() throws Exception {
        String guestToken = jwtUtil.generateToken("u", "ROLE_GUEST");
        mockMvc.perform(post("/api/ci/workflows/123")
                        .header("Authorization", "Bearer " + guestToken))
                .andExpect(status().isForbidden());
    }

    @Test
    public void testGuestCannotStreamSystemLogs() throws Exception {
        String guestToken = jwtUtil.generateToken("u", "ROLE_GUEST");
        mockMvc.perform(get("/api/servers/logs")
                        .header("Authorization", "Bearer " + guestToken))
                .andExpect(status().isForbidden());
    }

    @Test
    public void testGuestCannotStreamDockerLogs() throws Exception {
        String guestToken = jwtUtil.generateToken("u", "ROLE_GUEST");
        mockMvc.perform(get("/api/servers/docker/containers/abc123/logs")
                        .header("Authorization", "Bearer " + guestToken))
                .andExpect(status().isForbidden());
    }

    @Test
    public void testGuestCanStillReadDeployments() throws Exception {
        String guestToken = jwtUtil.generateToken("u", "ROLE_GUEST");
        mockMvc.perform(get("/api/servers/deployments")
                        .header("Authorization", "Bearer " + guestToken))
                .andExpect(result -> {
                    int status = result.getResponse().getStatus();
                    assertNotEquals(401, status);
                    assertNotEquals(403, status);
                });
    }

    @Test
    public void testUnmappedPathIsDenied() throws Exception {
        mockMvc.perform(get("/some/unmapped/path"))
                .andExpect(result -> {
                    int status = result.getResponse().getStatus();
                    assertTrue(status == 401 || status == 403, "Expected 401 or 403 but was: " + status);
                });
    }

    @Test
    public void testSpoofedLeadingXffSharesRateLimitBucket() throws Exception {
        Map<String, String> payload = Map.of("username", "admin", "password", "wrongpassword");

        for (int i = 0; i < 5; i++) {
            mockMvc.perform(post("/api/auth/login")
                            .header("X-Forwarded-For", "1.2.3." + i + ", 203.0.113.195")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(payload)))
                    .andExpect(status().isUnauthorized());
        }

        mockMvc.perform(post("/api/auth/login")
                        .header("X-Forwarded-For", "1.2.3.99, 203.0.113.195")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.error").value("Too many requests. Please try again later."));
    }

    @Test
    public void testAdminRejectedForInvalidDockerAction() throws Exception {
        String adminToken = jwtUtil.generateToken("admin", "ROLE_ADMIN");
        mockMvc.perform(post("/api/servers/docker/containers/abc123/destroy")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isBadRequest());
    }

    @Test
    public void testAdminRejectedForMalformedDeploymentId() throws Exception {
        String adminToken = jwtUtil.generateToken("admin", "ROLE_ADMIN");
        mockMvc.perform(post("/api/servers/deployments/not-a-valid-id/stop")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isBadRequest());
    }

    @Test
    public void testSpotifyRejectsUnknownResource() throws Exception {
        String guest = jwtUtil.generateToken("g", "ROLE_GUEST");
        mockMvc.perform(get("/api/spotify/../secrets")
                        .header("Authorization", "Bearer " + guest))
                .andExpect(status().is4xxClientError());
    }

    @Test
    public void testSpotifyRejectsInvalidRange() throws Exception {
        String guest = jwtUtil.generateToken("g", "ROLE_GUEST");
        mockMvc.perform(get("/api/spotify/top/artists?range=all_time")
                        .header("Authorization", "Bearer " + guest))
                .andExpect(status().isBadRequest());
    }

    @Test
    public void testSpotifyRejectsInvalidKind() throws Exception {
        String guest = jwtUtil.generateToken("g", "ROLE_GUEST");
        mockMvc.perform(get("/api/spotify/top/albums")
                        .header("Authorization", "Bearer " + guest))
                .andExpect(status().isBadRequest());
    }

    @Test
    public void testSpotifyRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/spotify/overview"))
                .andExpect(status().isUnauthorized());
    }
}
