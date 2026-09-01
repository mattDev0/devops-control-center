package com.devops.controlcenter.orchestrator.services;

import com.devops.controlcenter.orchestrator.exceptions.AgentUnreachableException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;

/**
 * Thin proxy to the Spotify analytics service. The orchestrator owns the
 * browser-facing security boundary, so the dashboard talks to it rather than
 * reaching the service directly.
 */
@Service
public class SpotifyService {

    private static final Logger logger = LoggerFactory.getLogger(SpotifyService.class);

    private final RestClient restClient;

    public SpotifyService(
            RestClient.Builder restClientBuilder,
            @Value("${spotify.url:http://devops-spotify:3002}") String baseUrl,
            @Value("${spotify.service-key:}") String serviceKey) {
        if (serviceKey == null || serviceKey.isBlank()) {
            // Without this the service answers 401 to everything, which is easy
            // to misread as the service being down. Say so once, loudly, at boot.
            logger.warn("spotify.service-key is not set; every Spotify request will be rejected as unauthorized");
        }
        this.restClient = restClientBuilder
                .baseUrl(baseUrl)
                .defaultHeader("X-Service-Key", serviceKey)
                .build();
    }

    public String fetch(String path) {
        try {
            return this.restClient.get().uri(path).retrieve().body(String.class);
        } catch (HttpClientErrorException.Unauthorized e) {
            // A rejected key is a configuration fault, not an outage. Reporting
            // it as "unreachable" sends the reader looking at the network.
            logger.error("Spotify service rejected our service key on {}", path);
            throw new AgentUnreachableException(
                    "Spotify service rejected the configured service key", e);
        } catch (Exception e) {
            logger.error("Spotify service unreachable on {}: {}", path, e.getMessage());
            throw new AgentUnreachableException("Spotify service is unreachable", e);
        }
    }
}
