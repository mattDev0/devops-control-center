package com.devops.controlcenter.orchestrator.websocket;

import org.springframework.http.server.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.support.DefaultHandshakeHandler;

import java.util.List;
import java.util.Map;

@Component
public class CustomHandshakeHandler extends DefaultHandshakeHandler {

    @Override
    protected String selectProtocol(List<String> requestedProtocols, WebSocketHandler webSocketHandler) {
        if (requestedProtocols != null && requestedProtocols.contains("access_token")) {
            return "access_token";
        }
        return super.selectProtocol(requestedProtocols, webSocketHandler);
    }
}
