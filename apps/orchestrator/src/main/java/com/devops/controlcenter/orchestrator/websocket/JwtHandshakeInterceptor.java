package com.devops.controlcenter.orchestrator.websocket;

import com.devops.controlcenter.orchestrator.security.JwtUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.util.List;
import java.util.Map;

@Component
public class JwtHandshakeInterceptor implements HandshakeInterceptor {

    private static final Logger logger = LoggerFactory.getLogger(JwtHandshakeInterceptor.class);
    private final JwtUtil jwtUtil;

    public JwtHandshakeInterceptor(JwtUtil jwtUtil) {
        this.jwtUtil = jwtUtil;
    }

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                   WebSocketHandler wsHandler, Map<String, Object> attributes) throws Exception {
        
        List<String> protocols = request.getHeaders().get("Sec-WebSocket-Protocol");
        if (protocols != null && !protocols.isEmpty()) {
            for (String headerValue : protocols) {
                if (headerValue == null) continue;
                String[] parts = headerValue.split(",");
                for (String part : parts) {
                    String token = part.trim();
                    if (StringUtils.hasText(token) && !"access_token".equals(token)) {
                        if (jwtUtil.validateToken(token)) {
                            attributes.put("token", token);
                            logger.debug("Successfully validated JWT from Sec-WebSocket-Protocol header and stored in session attributes");
                            return true;
                        } else {
                            logger.warn("Invalid JWT provided in Sec-WebSocket-Protocol header");
                        }
                    }
                }
            }
        }
        
        logger.warn("WebSocket handshake rejected: No valid JWT found in Sec-WebSocket-Protocol header");
        return false;
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                               WebSocketHandler wsHandler, Exception exception) {
        // No-op
    }
}
