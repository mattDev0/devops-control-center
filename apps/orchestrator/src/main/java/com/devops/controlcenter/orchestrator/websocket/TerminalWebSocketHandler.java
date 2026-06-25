package com.devops.controlcenter.orchestrator.websocket;
import com.devops.controlcenter.orchestrator.security.JwtUtil;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CompletableFuture;

@Component
public class TerminalWebSocketHandler extends TextWebSocketHandler {

    private static final Logger logger = LoggerFactory.getLogger(TerminalWebSocketHandler.class);

    private final JwtUtil jwtUtil;
    private final String agentUrl;
    private final String agentSecretKey;
    private final StandardWebSocketClient wsClient = new StandardWebSocketClient();
    
    // Maps frontend session ID -> agent WebSocket session
    private final Map<String, WebSocketSession> clientToAgentSessions = new ConcurrentHashMap<>();
    // Maps agent session ID -> frontend WebSocket session
    private final Map<String, WebSocketSession> agentToClientSessions = new ConcurrentHashMap<>();
    // Maps frontend session ID -> Future for agent WebSocket session
    private final Map<String, CompletableFuture<WebSocketSession>> agentSessionFutures = new ConcurrentHashMap<>();

    public TerminalWebSocketHandler(
            JwtUtil jwtUtil,
            @Value("${agent.url:http://localhost:3001}") String agentUrl,
            @Value("${agent.secret-key}") String agentSecretKey) {
        this.jwtUtil = jwtUtil;
        this.agentUrl = agentUrl;
        this.agentSecretKey = agentSecretKey;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession clientSession) throws Exception {
        String token = extractToken(clientSession);
        if (token == null || !jwtUtil.validateToken(token)) {
            clientSession.close(CloseStatus.BAD_DATA);
            return;
        }

        String role = jwtUtil.getRoleFromToken(token);
        if (!"ROLE_ADMIN".equals(role)) {
            clientSession.close(CloseStatus.POLICY_VIOLATION); // Reject guests
            return;
        }

        CompletableFuture<WebSocketSession> agentSessionFuture = new CompletableFuture<>();
        agentSessionFutures.put(clientSession.getId(), agentSessionFuture);

        // Establish connection to Rust Agent PTY WebSocket
        String agentWsUrl = agentUrl.replace("http://", "ws://").replace("https://", "wss://") 
                + "/ws/terminal";

        WebSocketHttpHeaders headers = new WebSocketHttpHeaders();
        headers.add("X-Agent-Key", agentSecretKey);

        try {
            wsClient.execute(new TextWebSocketHandler() {
                private WebSocketSession agentSession;

                @Override
                public void afterConnectionEstablished(WebSocketSession session) {
                    this.agentSession = session;
                    clientToAgentSessions.put(clientSession.getId(), session);
                    agentToClientSessions.put(session.getId(), clientSession);
                    CompletableFuture<WebSocketSession> future = agentSessionFutures.get(clientSession.getId());
                    if (future != null) {
                        future.complete(session);
                    }
                }

                @Override
                protected void handleTextMessage(WebSocketSession session, TextMessage message) {
                    try {
                        if (clientSession.isOpen()) {
                            clientSession.sendMessage(new TextMessage(message.getPayload()));
                        }
                    } catch (Exception e) {
                        logger.warn("Failed to forward agent message to client {}: {}", clientSession.getId(), e.getMessage());
                    }
                }

                @Override
                public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws IOException {
                    clientToAgentSessions.remove(clientSession.getId());
                    agentToClientSessions.remove(session.getId());
                    agentSessionFutures.remove(clientSession.getId());
                    if (clientSession.isOpen()) {
                        clientSession.close(status);
                    }
                }
            }, headers, java.net.URI.create(agentWsUrl))
            .whenComplete((session, ex) -> {
                if (ex != null) {
                    logger.error("Asynchronous WebSocket connection to agent failed: {}", ex.getMessage(), ex);
                    CompletableFuture<WebSocketSession> future = agentSessionFutures.remove(clientSession.getId());
                    if (future != null) {
                        future.completeExceptionally(ex);
                    }
                    try {
                        clientSession.close(CloseStatus.SERVER_ERROR);
                    } catch (IOException e) {
                        logger.error("Failed to close client session: {}", e.getMessage());
                    }
                }
            });
        } catch (Exception e) {
            logger.error("Failed to connect to agent PTY WebSocket: {}", e.getMessage());
            CompletableFuture<WebSocketSession> future = agentSessionFutures.remove(clientSession.getId());
            if (future != null) {
                future.completeExceptionally(e);
            }
            clientSession.close(CloseStatus.SERVER_ERROR);
        }
    }

    @Override
    protected void handleTextMessage(WebSocketSession clientSession, TextMessage message) throws Exception {
        CompletableFuture<WebSocketSession> future = agentSessionFutures.get(clientSession.getId());
        WebSocketSession agentSession = null;
        if (future != null) {
            try {
                // Wait up to 5 seconds for the agent session connection to establish
                agentSession = future.get(5, java.util.concurrent.TimeUnit.SECONDS);
            } catch (Exception e) {
                logger.warn("Timeout or error waiting for agent session for client {}: {}", clientSession.getId(), e.getMessage());
            }
        }
        if (agentSession == null) {
            agentSession = clientToAgentSessions.get(clientSession.getId());
        }
        if (agentSession != null && agentSession.isOpen()) {
            agentSession.sendMessage(new TextMessage(message.getPayload()));
        } else {
            logger.warn("Dropped client message to agent: agent session not open or not established yet");
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession clientSession, CloseStatus status) throws Exception {
        agentSessionFutures.remove(clientSession.getId());
        WebSocketSession agentSession = clientToAgentSessions.remove(clientSession.getId());
        if (agentSession != null) {
            agentToClientSessions.remove(agentSession.getId());
            if (agentSession.isOpen()) {
                agentSession.close(status);
            }
        }
    }

    private String extractToken(WebSocketSession session) {
        return (String) session.getAttributes().get("token");
    }
}
