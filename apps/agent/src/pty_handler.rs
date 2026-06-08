use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::response::IntoResponse;
use futures::{SinkExt, StreamExt};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::{Read, Write};

pub async fn ws_terminal_handler(ws: WebSocketUpgrade) -> impl IntoResponse {
    ws.on_upgrade(handle_socket)
}

async fn handle_socket(socket: WebSocket) {
    let pty_system = native_pty_system();
    let pair_res = pty_system.openpty(PtySize {
        rows: 24,
        cols: 80,
        pixel_width: 0,
        pixel_height: 0,
    });

    let pair = match pair_res {
        Ok(p) => p,
        Err(e) => {
            eprintln!("Failed to open PTY: {:?}", e);
            return;
        }
    };

    let shell = if std::path::Path::new("/bin/bash").exists() {
        "/bin/bash"
    } else {
        "/bin/sh"
    };

    let mut cmd = CommandBuilder::new(shell);
    cmd.cwd("/app");
    cmd.env("TERM", "xterm-256color");
    
    let child_res = pair.slave.spawn_command(cmd);
    let _child = match child_res {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Failed to spawn shell in PTY: {:?}", e);
            return;
        }
    };

    let mut pty_reader = match pair.master.try_clone_reader() {
        Ok(r) => r,
        Err(e) => {
            eprintln!("Failed to clone PTY reader: {:?}", e);
            return;
        }
    };

    let mut pty_writer = match pair.master.take_writer() {
        Ok(w) => w,
        Err(e) => {
            eprintln!("Failed to get PTY writer: {:?}", e);
            return;
        }
    };

    let (tx, mut rx) = tokio::sync::mpsc::channel::<Vec<u8>>(1024);

    tokio::task::spawn_blocking(move || {
        let mut buffer = [0u8; 4096];
        loop {
            match pty_reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(n) => {
                    if tx.blocking_send(buffer[..n].to_vec()).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });

    let (mut ws_sender, mut ws_receiver) = socket.split();

    let mut send_task = tokio::spawn(async move {
        while let Some(bytes) = rx.recv().await {
            if let Ok(text) = String::from_utf8(bytes) {
                if ws_sender.send(Message::Text(text)).await.is_err() {
                    break;
                }
            }
        }
    });

    let master_pty = pair.master;
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = ws_receiver.next().await {
            match msg {
                Message::Text(text) => {
                    if text.starts_with("{\"event\":") {
                        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) {
                            if value["event"] == "resize" {
                                if let (Some(cols), Some(rows)) = (value["cols"].as_u64(), value["rows"].as_u64()) {
                                    let _ = master_pty.resize(PtySize {
                                        rows: rows as u16,
                                        cols: cols as u16,
                                        pixel_width: 0,
                                        pixel_height: 0,
                                    });
                                }
                            }
                        }
                    } else {
                        let _ = pty_writer.write_all(text.as_bytes());
                        let _ = pty_writer.flush();
                    }
                }
                Message::Binary(bin) => {
                    let _ = pty_writer.write_all(&bin);
                    let _ = pty_writer.flush();
                }
                Message::Close(_) => break,
                _ => {}
            }
        }
    });

    tokio::select! {
        _ = &mut send_task => {
            recv_task.abort();
        }
        _ = &mut recv_task => {
            send_task.abort();
        }
    }
}
