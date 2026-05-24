package com.devops.controlcenter.orchestrator;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final String expectedUsername;
    private final String expectedPassword;
    private final JwtUtil jwtUtil;

    public AuthController(
            @Value("${admin.username}") String expectedUsername,
            @Value("${admin.password}") String expectedPassword,
            JwtUtil jwtUtil) {
        this.expectedUsername = expectedUsername;
        this.expectedPassword = expectedPassword;
        this.jwtUtil = jwtUtil;
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> request) {
        String username = request.get("username");
        String password = request.get("password");

        if (expectedUsername.equals(username) && expectedPassword.equals(password)) {
            String token = jwtUtil.generateToken(username, "ROLE_ADMIN");
            return ResponseEntity.ok(Map.of("token", token, "role", "ROLE_ADMIN"));
        }

        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(Map.of("error", "Invalid username or password"));
    }

    @PostMapping("/guest")
    public ResponseEntity<?> loginAsGuest() {
        String token = jwtUtil.generateToken("portfolio-guest", "ROLE_GUEST");
        return ResponseEntity.ok(Map.of("token", token, "role", "ROLE_GUEST"));
    }
}
