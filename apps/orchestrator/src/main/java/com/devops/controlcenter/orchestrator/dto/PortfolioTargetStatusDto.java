package com.devops.controlcenter.orchestrator.dto;

import java.time.Instant;
import java.util.List;

public record PortfolioTargetStatusDto(
    String key,
    String label,
    String url,
    Boolean up,
    Integer statusCode,
    Long latencyMs,
    Instant checkedAt,
    Instant lastSuccessAt,
    String error,
    Double uptimePercent,
    List<PortfolioSampleDto> history
) {}
