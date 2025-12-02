import { logger } from "../utils/logger.ts";
import { getDB } from "../db/kv.ts";
import type { LogEntry } from "../db/models.ts";

interface WSClient {
  socket: WebSocket;
  appId?: string;
  userId: string;
}

export class WebSocketManager {
  private clients: Set<WSClient>;

  constructor() {
    this.clients = new Set();
  }

  handleConnection(socket: WebSocket, userId: string): void {
    const client: WSClient = {
      socket,
      userId,
    };

    this.clients.add(client);

    logger.info(`WebSocket client connected: ${userId}`);

    socket.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        await this.handleMessage(client, message);
      } catch (error) {
        logger.error("WebSocket message error", { error: error.message });
        socket.send(JSON.stringify({ error: "Invalid message format" }));
      }
    };

    socket.onclose = () => {
      this.clients.delete(client);
      logger.info(`WebSocket client disconnected: ${userId}`);
    };

    socket.onerror = (error) => {
      logger.error("WebSocket error", { error });
      this.clients.delete(client);
    };

    // Send welcome message
    socket.send(JSON.stringify({
      type: "connected",
      message: "Connected to Denploy WebSocket",
    }));
  }

  private async handleMessage(client: WSClient, message: any): Promise<void> {
    switch (message.type) {
      case "subscribe_logs":
        await this.subscribeLogs(client, message.appId);
        break;

      case "unsubscribe_logs":
        this.unsubscribeLogs(client);
        break;

      case "ping":
        client.socket.send(JSON.stringify({ type: "pong" }));
        break;

      default:
        client.socket.send(JSON.stringify({ error: "Unknown message type" }));
    }
  }

  private async subscribeLogs(client: WSClient, appId: string): Promise<void> {
    try {
      // Verify user has access to this app
      const db = await getDB();
      const app = await db.getAppById(appId);

      if (!app) {
        client.socket.send(JSON.stringify({ error: "App not found" }));
        return;
      }

      if (app.userId !== client.userId) {
        client.socket.send(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      // Subscribe client to app logs
      client.appId = appId;

      // Send recent logs
      const logs = await db.getLogsByApp(appId, 50);
      client.socket.send(JSON.stringify({
        type: "logs_history",
        appId,
        logs,
      }));

      logger.info(`Client ${client.userId} subscribed to logs for app ${appId}`);
    } catch (error) {
      logger.error("Failed to subscribe to logs", { error: error.message });
      client.socket.send(JSON.stringify({ error: "Failed to subscribe" }));
    }
  }

  private unsubscribeLogs(client: WSClient): void {
    client.appId = undefined;
    logger.info(`Client ${client.userId} unsubscribed from logs`);
  }

  // Broadcast log entry to subscribed clients
  broadcastLog(log: LogEntry): void {
    for (const client of this.clients) {
      if (client.appId === log.appId && client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(JSON.stringify({
          type: "log",
          log,
        }));
      }
    }
  }

  // Broadcast app status change
  broadcastAppStatus(appId: string, status: string, userId: string): void {
    for (const client of this.clients) {
      if (client.userId === userId && client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(JSON.stringify({
          type: "app_status",
          appId,
          status,
        }));
      }
    }
  }

  // Get active connections count
  getConnectionCount(): number {
    return this.clients.size;
  }

  // Close all connections
  closeAll(): void {
    for (const client of this.clients) {
      if (client.socket.readyState === WebSocket.OPEN) {
        client.socket.close();
      }
    }
    this.clients.clear();
  }
}

// Singleton instance
let wsManagerInstance: WebSocketManager | null = null;

export function getWSManager(): WebSocketManager {
  if (!wsManagerInstance) {
    wsManagerInstance = new WebSocketManager();
  }
  return wsManagerInstance;
}
