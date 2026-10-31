package com.devops.controlcenter.orchestrator.dto;

import java.time.Instant;
import java.util.List;

public record WorkspaceSyncDto(
    String state,
    Instant checkedAt,
    String error,
    List<WorkspaceSyncHostDto> hosts
) {}
