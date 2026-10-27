package com.devops.controlcenter.orchestrator.dto;

import java.util.List;

public record PortfolioStatusDto(
    int intervalSeconds,
    List<PortfolioTargetStatusDto> targets
) {}
