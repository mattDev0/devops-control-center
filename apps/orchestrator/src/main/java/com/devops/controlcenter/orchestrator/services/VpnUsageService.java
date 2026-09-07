package com.devops.controlcenter.orchestrator.services;

import com.devops.controlcenter.orchestrator.dto.VpnUsageDto;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.Map;

/**
 * Reads the VPN's egress position from Prometheus.
 *
 * Prometheus is queried rather than the exporter directly so the dashboard sees
 * the same numbers the alert rules do, and so a scrape failure surfaces as
 * stale-but-known rather than as a second, differently-broken fetch path.
 */
@Service
public class VpnUsageService {

    private static final Logger logger = LoggerFactory.getLogger(VpnUsageService.class);

    /** Cost per GiB of egress beyond the free allowance, used only if the exporter publishes no dollar figure. */
    private static final double FALLBACK_USD_PER_GIB = 0.12;

    private final RestClient restClient;

    public VpnUsageService(
            RestClient.Builder restClientBuilder,
            @Value("${prometheus.url:http://devops-prometheus:9090}") String prometheusUrl) {
        this.restClient = restClientBuilder.baseUrl(prometheusUrl).build();
    }

    /** Returns the scalar value of an instant query, or null when the series is absent. */
    private Double query(String promql) {
        try {
            String uri = UriComponentsBuilder.fromPath("/api/v1/query")
                    .queryParam("query", promql)
                    .build()
                    .encode()
                    .toUriString();

            Map<?, ?> body = this.restClient.get().uri(uri).retrieve().body(Map.class);
            if (body == null || !"success".equals(body.get("status"))) return null;

            Map<?, ?> data = (Map<?, ?>) body.get("data");
            java.util.List<?> result = (java.util.List<?>) data.get("result");
            if (result == null || result.isEmpty()) return null;

            Map<?, ?> first = (Map<?, ?>) result.get(0);
            java.util.List<?> value = (java.util.List<?>) first.get("value");
            // value is [ <unix ts>, "<sample as string>" ]
            return Double.parseDouble(String.valueOf(value.get(1)));
        } catch (NumberFormatException e) {
            // Prometheus renders NaN and Inf as strings; treat both as "no answer".
            return null;
        } catch (Exception e) {
            logger.warn("Prometheus query failed [{}]: {}", promql, e.getMessage());
            return null;
        }
    }

    public VpnUsageDto fetch() {
        VpnUsageDto dto = new VpnUsageDto();

        Double up = query("up{job=\"vpn-us-01\"}");
        dto.setReachable(up != null && up == 1.0);

        // Prefer the credit-cycle counter. Matt's credit renews on the 16th, so
        // the calendar-month series describes the wrong window for half of each
        // month - fall back to it only so the panel is not blank meanwhile.
        Double cycleUsed = query("vpn_egress_bytes_cycle_total");
        if (cycleUsed != null) {
            dto.setUsedBytes(cycleUsed);
            dto.setCalendarMonthFallback(false);
        } else {
            dto.setUsedBytes(query("vpn_egress_bytes_total"));
            dto.setCalendarMonthFallback(true);
        }

        dto.setBudgetBytes(query("vpn_egress_budget_bytes"));
        dto.setCycleStart(asEpoch(query("vpn_cycle_start_timestamp")));
        dto.setCycleEnd(asEpoch(query("vpn_cycle_end_timestamp")));

        // Dollars are what the credit is denominated in. Use the exporter's own
        // figure when it publishes one; only estimate if it does not.
        Double cost = query("vpn_cost_usd_cycle");
        if (cost == null && dto.getUsedBytes() != null) {
            cost = (dto.getUsedBytes() / 1073741824.0) * FALLBACK_USD_PER_GIB;
        }
        dto.setCostUsd(cost);
        dto.setCreditUsd(query("vpn_credit_usd"));

        // Both of these say how far the figures above can be trusted. The panel
        // shows them rather than presenting an estimate as a measurement.
        Double complete = query("vpn_cycle_data_complete");
        dto.setDataComplete(complete == null ? null : complete == 1.0);
        Double estimated = query("vpn_cost_is_estimated");
        dto.setCostEstimated(estimated == null ? null : estimated == 1.0);

        // Lifetime counter: rate() across the monthly reset would be distorted.
        Double burn = query("rate(vpn_egress_bytes_lifetime_total[6h]) * 86400");
        dto.setBurnBytesPerDay(burn);

        Double tunnelsUp = query("sum(vpn_tunnel_up)");
        Double tunnelsTotal = query("count(vpn_tunnel_up)");
        dto.setTunnelsUp(tunnelsUp == null ? null : tunnelsUp.intValue());
        dto.setTunnelsTotal(tunnelsTotal == null ? null : tunnelsTotal.intValue());

        Double armed = query("vpn_autostop_armed");
        dto.setAutostopArmed(armed == null ? null : armed == 1.0);

        return dto;
    }

    private Long asEpoch(Double v) {
        return v == null ? null : v.longValue();
    }
}
