package com.devops.controlcenter.orchestrator.security;

import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class RateLimitFilter implements Filter {

    private static final int MAX_REQUESTS_PER_MINUTE = 5;
    private static final long WINDOW_SIZE_MS = 60 * 1000L; // 1 minute

    // Map IP to list of request timestamps
    private static final Map<String, List<Long>> requestTimestamps = new ConcurrentHashMap<>();

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        
        if (request instanceof HttpServletRequest httpRequest && response instanceof HttpServletResponse httpResponse) {
            String path = httpRequest.getRequestURI();
            
            // Only rate limit /api/auth/login and /api/auth/guest
            if ("/api/auth/login".equals(path) || "/api/auth/guest".equals(path)) {
                String ip = getClientIp(httpRequest);
                long now = System.currentTimeMillis();
                
                List<Long> timestamps = requestTimestamps.computeIfAbsent(ip, k -> Collections.synchronizedList(new ArrayList<>()));
                
                synchronized (timestamps) {
                    // Remove timestamps older than 1 minute
                    timestamps.removeIf(timestamp -> now - timestamp > WINDOW_SIZE_MS);
                    
                    if (timestamps.size() >= MAX_REQUESTS_PER_MINUTE) {
                        httpResponse.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
                        httpResponse.setContentType("application/json");
                        httpResponse.getWriter().write("{\"error\": \"Too many requests. Please try again later.\"}");
                        return;
                    }
                    
                    timestamps.add(now);
                }
            }
        }
        
        chain.doFilter(request, response);
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
