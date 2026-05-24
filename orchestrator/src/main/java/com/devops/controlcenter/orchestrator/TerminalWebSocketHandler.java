package com.devops.controlcenter.orchestrator;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class TerminalWebSocketHandler extends TextWebSocketHandler {

    private final JwtUtil jwtUtil;
    private final String agentUrl;
    private final String agentSecretKey;
    private final StandardWebSocketClient wsClient = new StandardWebSocketClient();
    
    // Maps frontend session ID -> agent WebSocket session
    private final Map<String, WebSocketSession> clientToAgentSessions = new ConcurrentHashMap<>();
    // Maps agent session ID -> frontend WebSocket session
    private final Map<String, WebSocketSession> agentToClientSessions = new ConcurrentHashMap<>();

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
                }

                @Override
                protected void handleTextMessage(WebSocketSession session, TextMessage message) throws IOException {
                    if (clientSession.isOpen()) {
                        clientSession.sendMessage(new TextMessage(message.getPayload()));
                    }
                }

                @Override
                public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws IOException {
                    clientToAgentSessions.remove(clientSession.getId());
                    agentToClientSessions.remove(session.getId());
                    if (clientSession.isOpen()) {
                        clientSession.close(status);
                    }
                }
            }, headers, java.net.URI.create(agentWsUrl));
        } catch (Exception e) {
            System.err.println("Failed to connect to agent PTY WebSocket: " + e.getMessage());
            clientSession.close(CloseStatus.SERVER_ERROR);
        }
    }

    @Override
    protected void handleTextMessage(WebSocketSession clientSession, TextMessage message) throws Exception {
        WebSocketSession agentSession = clientToAgentSessions.get(clientSession.getId());
        if (agentSession != null && agentSession.isOpen()) {
            agentSession.sendMessage(new TextMessage(message.getPayload()));
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession clientSession, CloseStatus status) throws Exception {
        WebSocketSession agentSession = clientToAgentSessions.remove(clientSession.getId());
        if (agentSession != null) {
            agentToClientSessions.remove(agentSession.getId());
            if (agentSession.isOpen()) {
                agentSession.close(status);
            }
        }
    }

    private String extractToken(WebSocketSession session) {
        if (session.getUri() == null) return null;
        String query = session.getUri().getQuery();
        if (query == null) return null;
        for (String param : query.split("&")) {
            String[] pair = param.split("=");
            if (pair.length == 2 && "token".equals(pair[0])) {
                return pair[1];
            }
        }
        return null;
    }
}
