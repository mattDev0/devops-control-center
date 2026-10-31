package com.devops.controlcenter.orchestrator.dto;

import java.time.Instant;

public record WorkspaceVmDto(
    String state,
    String label,
    String status,
    String region,
    Instant checkedAt,
    String error
) {}
