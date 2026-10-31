package com.devops.controlcenter.orchestrator.dto;

public record WorkspaceStatusDto(
    WorkspaceVmDto vm,
    WorkspaceCreditDto credit,
    WorkspaceSyncDto sync
) {}
