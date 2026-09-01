package com.devops.controlcenter.orchestrator.controllers;

import com.devops.controlcenter.orchestrator.services.SpotifyService;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Set;

@RestController
@RequestMapping("/api/spotify")
public class SpotifyController {

    /** Only these are proxied; anything else is rejected rather than forwarded. */
    private static final Set<String> ALLOWED_PATHS = Set.of(
            "overview", "genres", "recent", "discovery",
            "history/hourly", "history/weekday", "history/monthly");

    private static final Set<String> ALLOWED_RANGES =
            Set.of("short_term", "medium_term", "long_term");

    private final SpotifyService spotifyService;

    public SpotifyController(SpotifyService spotifyService) {
        this.spotifyService = spotifyService;
    }

    @GetMapping(value = "/{*path}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> proxy(@PathVariable String path) {
        String clean = path.startsWith("/") ? path.substring(1) : path;
        if (!ALLOWED_PATHS.contains(clean)) {
            return ResponseEntity.badRequest().body("{\"error\":\"unknown resource\"}");
        }
        return ResponseEntity.ok(spotifyService.fetch("/" + clean));
    }

    @GetMapping(value = "/top/{kind}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> top(
            @PathVariable String kind,
            @RequestParam(defaultValue = "medium_term") String range,
            @RequestParam(defaultValue = "20") int limit) {
        if (!kind.equals("artists") && !kind.equals("tracks")) {
            return ResponseEntity.badRequest().body("{\"error\":\"kind must be artists or tracks\"}");
        }
        if (!ALLOWED_RANGES.contains(range)) {
            return ResponseEntity.badRequest().body("{\"error\":\"invalid range\"}");
        }
        int safeLimit = Math.max(1, Math.min(limit, 50));
        return ResponseEntity.ok(
                spotifyService.fetch("/top/" + kind + "?range=" + range + "&limit=" + safeLimit));
    }
}
