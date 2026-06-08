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
    "management.endpoint.health.show-details=always"
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
        Map<String, String> payload = Map.of("username", "admin", "password", "admin-password-change-me");
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
    public void testPathRoleRestrictionExecuteCommand() throws Exception {
        // Unauthenticated request to /api/servers/execute should return 401
        mockMvc.perform(post("/api/servers/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"command\":\"ls\",\"args\":[]}"))
                .andExpect(status().isUnauthorized());

        // Guest token should return 403 Forbidden for execute command (admin only)
        String guestToken = jwtUtil.generateToken("portfolio-guest", "ROLE_GUEST");
        mockMvc.perform(post("/api/servers/execute")
                        .header("Authorization", "Bearer " + guestToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"command\":\"ls\",\"args\":[]}"))
                .andExpect(status().isForbidden());

        // Admin token should be processed (in this test, it will try to call the mocked/unreachable AgentService
        // and throw AgentUnreachableException, which the GlobalExceptionHandler will map to 503)
        String adminToken = jwtUtil.generateToken("admin", "ROLE_ADMIN");
        mockMvc.perform(post("/api/servers/execute")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"command\":\"ls\",\"args\":[]}"))
                .andExpect(status().isServiceUnavailable());
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
}
