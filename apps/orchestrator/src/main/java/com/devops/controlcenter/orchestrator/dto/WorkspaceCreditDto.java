package com.devops.controlcenter.orchestrator.dto;

import java.math.BigDecimal;
import java.time.Instant;

public record WorkspaceCreditDto(
    String state,
    BigDecimal remainingUsd,
    BigDecimal uninvoicedUsd,
    Instant expiresAt,
    Integer daysLeft,
    Instant checkedAt,
    String error
) {}
