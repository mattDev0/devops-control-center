package com.devops.controlcenter.orchestrator;

import com.devops.controlcenter.orchestrator.dto.VpnUsageDto;
import com.devops.controlcenter.orchestrator.services.VpnUsageService;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.anything;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.http.MediaType.APPLICATION_JSON;

class VpnUsageServiceTest {

    /** Captures every outgoing URI so the encoding can be asserted. */
    private List<URI> recordUris(String body, int expectedCalls) {
        List<URI> seen = new ArrayList<>();
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(org.springframework.test.web.client.ExpectedCount.manyTimes(), anything())
              .andExpect(request -> seen.add(request.getURI()))
              .andRespond(withSuccess(body, APPLICATION_JSON));

        VpnUsageService service = new VpnUsageService(builder, "http://prometheus:9090");
        service.fetch();
        return seen;
    }

    private static final String EMPTY =
            "{\"status\":\"success\",\"data\":{\"resultType\":\"vector\",\"result\":[]}}";

    /**
     * Regression: the query was encoded by hand and then again by the client, so
     * '{' arrived as %257B. Prometheus decoded one layer, read the remaining '%'
     * as modulo and answered 400. Only expressions containing { } " [ ] broke,
     * which is why plain metric names looked fine.
     */
    @Test
    void promqlIsEncodedExactlyOnce() {
        List<URI> uris = recordUris(EMPTY, 1);
        assertFalse(uris.isEmpty(), "expected at least one Prometheus call");

        for (URI uri : uris) {
            String raw = uri.getRawQuery();
            assertNotNull(raw);
            assertFalse(raw.contains("%25"),
                    "query was encoded twice, a literal percent reached Prometheus: " + raw);
        }
    }

    /** The brace-bearing expressions are the ones that regressed; assert they are sent. */
    @Test
    void sendsTheExpressionsThatContainBracesAndBrackets() {
        List<URI> uris = recordUris(EMPTY, 1);
        String all = String.join("\n", uris.stream().map(u -> {
            String q = u.getQuery(); // decoded form
            return q == null ? "" : q;
        }).toList());

        assertTrue(all.contains("up{job=\"vpn-us-01\"}"), "the target-health query must be sent");
        assertTrue(all.contains("rate(vpn_egress_bytes_lifetime_total[6h])"),
                "the burn-rate query must be sent");
    }

    /** An absent series must read as unknown rather than as a confident zero. */
    @Test
    void absentSeriesLeaveFieldsNull() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(org.springframework.test.web.client.ExpectedCount.manyTimes(), anything())
              .andRespond(withSuccess(EMPTY, APPLICATION_JSON));

        VpnUsageDto dto = new VpnUsageService(builder, "http://prometheus:9090").fetch();

        assertFalse(dto.isReachable());
        assertNull(dto.getCreditUsd(), "no credit series must not become a hardcoded ceiling");
        assertNull(dto.getUsedBytes());
        assertNull(dto.getAutostopArmed(), "unknown guard state must not read as armed");
    }
}
