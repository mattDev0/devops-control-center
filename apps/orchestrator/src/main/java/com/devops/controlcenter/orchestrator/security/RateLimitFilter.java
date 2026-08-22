package com.devops.controlcenter.orchestrator.security;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class RateLimitFilter extends OncePerRequestFilter {

    private static final int MAX_REQUESTS_PER_MINUTE = 5;
    private static final long WINDOW_SIZE_MS = 60 * 1000L; // 1 minute

    // Map IP to list of request timestamps
    private static final Map<String, List<Long>> requestTimestamps = new ConcurrentHashMap<>();

    private final ScheduledExecutorService cleanupScheduler = Executors.newSingleThreadScheduledExecutor();

    @PostConstruct
    public void startCleanup() {
        cleanupScheduler.scheduleAtFixedRate(() -> {
            long now = System.currentTimeMillis();
            requestTimestamps.entrySet().removeIf(entry -> {
                List<Long> ts = entry.getValue();
                synchronized (ts) {
                    ts.removeIf(t -> now - t > WINDOW_SIZE_MS);
                    return ts.isEmpty();
                }
            });
        }, 5, 5, TimeUnit.MINUTES);
    }

    @PreDestroy
    public void stopCleanup() {
        cleanupScheduler.shutdown();
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        
        String path = request.getRequestURI();
        
        // Only rate limit /api/auth/login and /api/auth/guest
        if ("/api/auth/login".equals(path) || "/api/auth/guest".equals(path)) {
            String ip = getClientIp(request);
            long now = System.currentTimeMillis();
            
            List<Long> timestamps = requestTimestamps.computeIfAbsent(ip, k -> Collections.synchronizedList(new ArrayList<>()));
            
            synchronized (timestamps) {
                // Remove timestamps older than 1 minute
                timestamps.removeIf(timestamp -> now - timestamp > WINDOW_SIZE_MS);
                
                if (timestamps.size() >= MAX_REQUESTS_PER_MINUTE) {
                    response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
                    response.setContentType("application/json");
                    response.getWriter().write("{\"error\": \"Too many requests. Please try again later.\"}");
                    return;
                }
                
                timestamps.add(now);
            }
        }
        
        filterChain.doFilter(request, response);
    }

    private String getClientIp(HttpServletRequest request) {
        String xfHeader = request.getHeader("X-Forwarded-For");
        if (xfHeader == null || xfHeader.isEmpty()) {
            return request.getRemoteAddr();
        }
        return xfHeader.split(",")[0].trim();
    }

    public void reset() {
        requestTimestamps.clear();
    }
}
