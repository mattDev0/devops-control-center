package com.devops.controlcenter.orchestrator.dto;

import java.time.Instant;

public record WorkspaceSyncHostDto(
    String host,
    String label,
    Instant lastChangeAt
) {}
