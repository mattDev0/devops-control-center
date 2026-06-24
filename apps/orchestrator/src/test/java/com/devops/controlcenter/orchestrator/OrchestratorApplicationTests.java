package com.devops.controlcenter.orchestrator;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(properties = {
    "agent.secret-key=test-agent-secret-key-123",
    "admin.password=admin-password-change-me",
    "jwt.secret=jwt-signing-secret-key-change-me-should-be-long-and-random-32-bytes"
})
class OrchestratorApplicationTests {

	@Test
	void contextLoads() {
	}

}
