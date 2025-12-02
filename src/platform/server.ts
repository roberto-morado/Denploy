import { Hono } from "@hono/hono";
import { config } from "../config.ts";
import { logger } from "../utils/logger.ts";
import { getNginxManager } from "../core/nginx-manager.ts";

// Middleware
import { loggerMiddleware } from "./middleware/logger.ts";
import { corsMiddleware } from "./middleware/cors.ts";
import { authMiddleware, optionalAuthMiddleware } from "./middleware/auth.ts";

// Routes
import authRoutes from "./routes/auth.ts";
import appsRoutes from "./routes/apps.ts";

// Views
import {
  homePage,
  loginPage,
  registerPage,
  dashboardPage,
  appDetailPage,
  createAppPage,
} from "./views/pages.ts";

// WebSocket
import { getWSManager } from "./websocket.ts";
import { verifyToken } from "../utils/security.ts";
import { getDB } from "../db/kv.ts";

export async function createServer(): Promise<Hono> {
  const app = new Hono();

  // Global middleware
  app.use("/*", loggerMiddleware);
  app.use("/api/*", corsMiddleware);

  // Health check endpoint
  app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

  // WebSocket endpoint
  app.get("/ws", async (c) => {
    const token = c.req.query("token");

    if (!token) {
      return c.json({ error: "Token required" }, 401);
    }

    const payload = await verifyToken(token);

    if (!payload || !payload.userId) {
      return c.json({ error: "Invalid token" }, 401);
    }

    const upgrade = c.req.header("upgrade");
    if (upgrade !== "websocket") {
      return c.json({ error: "Expected WebSocket" }, 400);
    }

    const { socket, response } = Deno.upgradeWebSocket(c.req.raw);

    const wsManager = getWSManager();
    wsManager.handleConnection(socket, payload.userId as string);

    return response;
  });

  // API Routes
  app.route("/auth", authRoutes);
  app.route("/api/apps", appsRoutes);

  // Web UI Routes
  app.get("/", optionalAuthMiddleware, (c) => {
    const user = c.get("user");
    if (user) {
      return c.redirect("/dashboard");
    }
    return c.html(homePage());
  });

  app.get("/login", (c) => {
    return c.html(loginPage());
  });

  app.get("/register", (c) => {
    return c.html(registerPage());
  });

  app.get("/dashboard", authMiddleware, async (c) => {
    const user = c.get("user");
    const db = await getDB();
    const apps = await db.getAppsByUser(user.id);
    return c.html(dashboardPage(user, apps));
  });

  app.get("/dashboard/apps/new", authMiddleware, (c) => {
    const user = c.get("user");
    return c.html(createAppPage(user));
  });

  app.get("/dashboard/apps/:id", authMiddleware, async (c) => {
    const user = c.get("user");
    const appId = c.req.param("id");
    const db = await getDB();

    const app = await db.getAppById(appId);

    if (!app) {
      return c.html("<h1>App not found</h1>", 404);
    }

    if (app.userId !== user.id) {
      return c.html("<h1>Unauthorized</h1>", 403);
    }

    const deployments = await db.getDeploymentsByApp(appId);

    return c.html(appDetailPage(user, app, deployments));
  });

  // 404 handler
  app.notFound((c) => {
    return c.html("<h1>404 - Not Found</h1>", 404);
  });

  // Error handler
  app.onError((err, c) => {
    logger.error("Server error", { error: err.message, stack: err.stack });
    return c.json({ error: "Internal server error" }, 500);
  });

  return app;
}

export async function startServer(): Promise<void> {
  try {
    logger.info("Starting Denploy platform...");

    // Initialize Nginx directories
    const nginxManager = getNginxManager();
    await nginxManager.createNginxDirectories();
    await nginxManager.generateMainConfig();

    logger.info("Nginx directories initialized");

    // Create and start server
    const app = await createServer();

    logger.info(`Server starting on http://${config.platform.host}:${config.platform.port}`);

    Deno.serve({
      port: config.platform.port,
      hostname: config.platform.host,
      onListen: ({ port, hostname }) => {
        logger.info(`Denploy is running on http://${hostname}:${port}`);
        logger.info(`Dashboard: http://${hostname}:${port}/dashboard`);
        logger.info(`API: http://${hostname}:${port}/api`);
      },
    }, app.fetch);
  } catch (error) {
    logger.error("Failed to start server", { error: error.message, stack: error.stack });
    throw error;
  }
}
