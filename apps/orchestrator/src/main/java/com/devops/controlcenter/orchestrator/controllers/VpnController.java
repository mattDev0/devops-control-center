package com.devops.controlcenter.orchestrator.controllers;

import com.devops.controlcenter.orchestrator.dto.VpnUsageDto;
import com.devops.controlcenter.orchestrator.services.VpnUsageService;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/vpn")
public class VpnController {

    private final VpnUsageService vpnUsageService;

    public VpnController(VpnUsageService vpnUsageService) {
        this.vpnUsageService = vpnUsageService;
    }

    @GetMapping(value = "/usage", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<VpnUsageDto> usage() {
        return ResponseEntity.ok(vpnUsageService.fetch());
    }
}
