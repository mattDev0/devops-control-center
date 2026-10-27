package com.devops.controlcenter.orchestrator.dto;

import java.time.Instant;

public record PortfolioSampleDto(
    Instant checkedAt,
    boolean up,
    Long latencyMs
) {}
