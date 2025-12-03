import { Hono } from "@hono/hono";
import { v4 } from "@std/uuid";
import { getDB } from "../../db/kv.ts";
import { getProcessManager } from "../../core/process-manager.ts";
import { getFileManager } from "../../core/file-manager.ts";
import { getNginxManager } from "../../core/nginx-manager.ts";
import { getDeploymentService } from "../../core/deployment.ts";
import { getResourceMonitor } from "../../core/resource-monitor.ts";
import { authMiddleware } from "../middleware/auth.ts";
import { logger } from "../../utils/logger.ts";
import { validateAppName, validateSubdomain, validateFileUpload, validateCustomDomain } from "../../utils/validation.ts";
import { sanitizeSubdomain } from "../../utils/security.ts";
import { config } from "../../config.ts";
import type { App } from "../../db/models.ts";

const apps = new Hono();

// All routes require authentication
apps.use("/*", authMiddleware);

// Get all user's apps
apps.get("/", async (c) => {
  try {
    const user = c.get("user");
    const db = await getDB();

    const userApps = await db.getAppsByUser(user.id);

    return c.json({ apps: userApps });
  } catch (error) {
    logger.error("Failed to get apps", { error: error.message });
    return c.json({ error: "Failed to get apps" }, 500);
  }
});

// Get specific app
apps.get("/:id", async (c) => {
  try {
    const user = c.get("user");
    const appId = c.req.param("id");
    const db = await getDB();

    const app = await db.getAppById(appId);

    if (!app) {
      return c.json({ error: "App not found" }, 404);
    }

    if (app.userId !== user.id) {
      return c.json({ error: "Unauthorized" }, 403);
    }

    return c.json({ app });
  } catch (error) {
    logger.error("Failed to get app", { error: error.message });
    return c.json({ error: "Failed to get app" }, 500);
  }
});

// Create new app
apps.post("/", async (c) => {
  try {
    const user = c.get("user");
    const body = await c.req.json();
    const { name, subdomain: requestedSubdomain } = body;

    // Validate app name
    const nameValidation = validateAppName(name);
    if (!nameValidation.valid) {
      return c.json({ error: "Validation failed", details: nameValidation.errors }, 400);
    }

    // Sanitize and validate subdomain
    const subdomain = requestedSubdomain
      ? sanitizeSubdomain(requestedSubdomain)
      : sanitizeSubdomain(name);

    const subdomainValidation = validateSubdomain(subdomain);
    if (!subdomainValidation.valid) {
      return c.json({ error: "Validation failed", details: subdomainValidation.errors }, 400);
    }

    const db = await getDB();

    // Check if subdomain is taken
    const existingApp = await db.getAppBySubdomain(subdomain);
    if (existingApp) {
      return c.json({ error: "Subdomain already taken" }, 409);
    }

    // Get next available port
    const port = await db.getNextAvailablePort(config.apps.startPort);

    // Create app
    const app: App = {
      id: v4.generate() as string,
      userId: user.id,
      name,
      subdomain,
      customDomains: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      status: "stopped",
      port,
      envVars: {},
    };

    await db.createApp(app);
    await db.assignPort(port, app.id);

    // Generate Nginx config
    const nginxManager = getNginxManager();
    await nginxManager.generateAppConfig(app);

    logger.info(`App created: ${name} (${app.id}) by user ${user.email}`);

    return c.json({ app }, 201);
  } catch (error) {
    logger.error("Failed to create app", { error: error.message });
    return c.json({ error: "Failed to create app" }, 500);
  }
});

// Update app
apps.put("/:id", async (c) => {
  try {
    const user = c.get("user");
    const appId = c.req.param("id");
    const body = await c.req.json();
    const db = await getDB();

    const app = await db.getAppById(appId);

    if (!app) {
      return c.json({ error: "App not found" }, 404);
    }

    if (app.userId !== user.id) {
      return c.json({ error: "Unauthorized" }, 403);
    }

    // Update allowed fields
    const updates: Partial<App> = {};

    if (body.name) {
      const validation = validateAppName(body.name);
      if (!validation.valid) {
        return c.json({ error: "Validation failed", details: validation.errors }, 400);
      }
      updates.name = body.name;
    }

    if (body.envVars) {
      updates.envVars = body.envVars;
    }

    await db.updateApp(appId, updates);

    const updatedApp = await db.getAppById(appId);

    return c.json({ app: updatedApp });
  } catch (error) {
    logger.error("Failed to update app", { error: error.message });
    return c.json({ error: "Failed to update app" }, 500);
  }
});

// Delete app
apps.delete("/:id", async (c) => {
  try {
    const user = c.get("user");
    const appId = c.req.param("id");
    const db = await getDB();

    const app = await db.getAppById(appId);

    if (!app) {
      return c.json({ error: "App not found" }, 404);
    }

    if (app.userId !== user.id) {
      return c.json({ error: "Unauthorized" }, 403);
    }

    // Stop app if running
    const processManager = getProcessManager();
    if (processManager.isRunning(appId)) {
      await processManager.stopApp(appId);
    }

    // Remove Nginx config
    const nginxManager = getNginxManager();
    await nginxManager.removeAppConfig(app);

    // Delete app files
    const fileManager = getFileManager();
    await fileManager.deleteAppFiles(app.userId, app.name);

    // Release port
    await db.releasePort(app.port);

    // Delete app from database
    await db.deleteApp(appId);

    logger.info(`App deleted: ${app.name} (${appId})`);

    return c.json({ success: true });
  } catch (error) {
    logger.error("Failed to delete app", { error: error.message });
    return c.json({ error: "Failed to delete app" }, 500);
  }
});

// Start app
apps.post("/:id/start", async (c) => {
  try {
    const user = c.get("user");
    const appId = c.req.param("id");
    const db = await getDB();

    const app = await db.getAppById(appId);

    if (!app) {
      return c.json({ error: "App not found" }, 404);
    }

    if (app.userId !== user.id) {
      return c.json({ error: "Unauthorized" }, 403);
    }

    if (!app.currentDeploymentId) {
      return c.json({ error: "No deployment available" }, 400);
    }

    const processManager = getProcessManager();
    const fileManager = getFileManager();

    const currentPath = fileManager.getCurrentDeploymentPath(app.userId, app.name);

    await processManager.startApp(app, currentPath);

    return c.json({ success: true, status: "running" });
  } catch (error) {
    logger.error("Failed to start app", { error: error.message });
    return c.json({ error: "Failed to start app" }, 500);
  }
});

// Stop app
apps.post("/:id/stop", async (c) => {
  try {
    const user = c.get("user");
    const appId = c.req.param("id");
    const db = await getDB();

    const app = await db.getAppById(appId);

    if (!app) {
      return c.json({ error: "App not found" }, 404);
    }

    if (app.userId !== user.id) {
      return c.json({ error: "Unauthorized" }, 403);
    }

    const processManager = getProcessManager();
    await processManager.stopApp(appId);

    return c.json({ success: true, status: "stopped" });
  } catch (error) {
    logger.error("Failed to stop app", { error: error.message });
    return c.json({ error: "Failed to stop app" }, 500);
  }
});

// Restart app
apps.post("/:id/restart", async (c) => {
  try {
    const user = c.get("user");
    const appId = c.req.param("id");
    const db = await getDB();

    const app = await db.getAppById(appId);

    if (!app) {
      return c.json({ error: "App not found" }, 404);
    }

    if (app.userId !== user.id) {
      return c.json({ error: "Unauthorized" }, 403);
    }

    if (!app.currentDeploymentId) {
      return c.json({ error: "No deployment available" }, 400);
    }

    const processManager = getProcessManager();
    const fileManager = getFileManager();

    const currentPath = fileManager.getCurrentDeploymentPath(app.userId, app.name);

    await processManager.restartApp(app, currentPath);

    return c.json({ success: true, status: "running" });
  } catch (error) {
    logger.error("Failed to restart app", { error: error.message });
    return c.json({ error: "Failed to restart app" }, 500);
  }
});

// Deploy app (upload file)
apps.post("/:id/deploy", async (c) => {
  try {
    const user = c.get("user");
    const appId = c.req.param("id");
    const db = await getDB();

    const app = await db.getAppById(appId);

    if (!app) {
      return c.json({ error: "App not found" }, 404);
    }

    if (app.userId !== user.id) {
      return c.json({ error: "Unauthorized" }, 403);
    }

    // Get file from form data
    const formData = await c.req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return c.json({ error: "No file provided" }, 400);
    }

    // Validate file
    const validation = validateFileUpload(
      file.name,
      file.size,
      config.limits.maxUploadSizeMB
    );

    if (!validation.valid) {
      return c.json({ error: "Validation failed", details: validation.errors }, 400);
    }

    // Determine file type
    const fileType = file.name.endsWith(".zip") ? "zip" : "single";

    // Read file data
    const fileData = new Uint8Array(await file.arrayBuffer());

    // Deploy
    const deploymentService = getDeploymentService();
    const deployment = await deploymentService.deployApp(app, {
      fileData,
      fileName: file.name,
      fileType,
      deployedBy: user.id,
    });

    logger.info(`App deployed: ${app.name} (deployment ${deployment.id})`);

    return c.json({ deployment }, 201);
  } catch (error) {
    logger.error("Failed to deploy app", { error: error.message });
    return c.json({ error: error.message }, 500);
  }
});

// Get app deployments
apps.get("/:id/deployments", async (c) => {
  try {
    const user = c.get("user");
    const appId = c.req.param("id");
    const db = await getDB();

    const app = await db.getAppById(appId);

    if (!app) {
      return c.json({ error: "App not found" }, 404);
    }

    if (app.userId !== user.id) {
      return c.json({ error: "Unauthorized" }, 403);
    }

    const deployments = await db.getDeploymentsByApp(appId);

    return c.json({ deployments });
  } catch (error) {
    logger.error("Failed to get deployments", { error: error.message });
    return c.json({ error: "Failed to get deployments" }, 500);
  }
});

// Rollback to deployment
apps.post("/:id/deployments/:deploymentId/rollback", async (c) => {
  try {
    const user = c.get("user");
    const appId = c.req.param("id");
    const deploymentId = c.req.param("deploymentId");
    const db = await getDB();

    const app = await db.getAppById(appId);

    if (!app) {
      return c.json({ error: "App not found" }, 404);
    }

    if (app.userId !== user.id) {
      return c.json({ error: "Unauthorized" }, 403);
    }

    const deploymentService = getDeploymentService();
    await deploymentService.rollbackDeployment(appId, deploymentId);

    return c.json({ success: true });
  } catch (error) {
    logger.error("Failed to rollback deployment", { error: error.message });
    return c.json({ error: error.message }, 500);
  }
});

// Get app logs
apps.get("/:id/logs", async (c) => {
  try {
    const user = c.get("user");
    const appId = c.req.param("id");
    const db = await getDB();

    const app = await db.getAppById(appId);

    if (!app) {
      return c.json({ error: "App not found" }, 404);
    }

    if (app.userId !== user.id) {
      return c.json({ error: "Unauthorized" }, 403);
    }

    const limit = parseInt(c.req.query("limit") || "100");
    const logs = await db.getLogsByApp(appId, limit);

    return c.json({ logs });
  } catch (error) {
    logger.error("Failed to get logs", { error: error.message });
    return c.json({ error: "Failed to get logs" }, 500);
  }
});

// Add custom domain
apps.post("/:id/domains", async (c) => {
  try {
    const user = c.get("user");
    const appId = c.req.param("id");
    const body = await c.req.json();
    const { domain } = body;

    // Validate domain
    const validation = validateCustomDomain(domain);
    if (!validation.valid) {
      return c.json({ error: "Validation failed", details: validation.errors }, 400);
    }

    const db = await getDB();
    const app = await db.getAppById(appId);

    if (!app) {
      return c.json({ error: "App not found" }, 404);
    }

    if (app.userId !== user.id) {
      return c.json({ error: "Unauthorized" }, 403);
    }

    // Check if domain already added
    if (app.customDomains.includes(domain)) {
      return c.json({ error: "Domain already added" }, 409);
    }

    // Add domain
    const updatedDomains = [...app.customDomains, domain];
    await db.updateApp(appId, { customDomains: updatedDomains });

    // Regenerate Nginx config
    const updatedApp = await db.getAppById(appId);
    if (updatedApp) {
      const nginxManager = getNginxManager();
      await nginxManager.generateAppConfig(updatedApp);
    }

    logger.info(`Custom domain added: ${domain} for app ${app.name}`);

    return c.json({
      success: true,
      customDomains: updatedDomains,
      message: `Domain ${domain} added. Make sure it points to your server's IP.`
    });
  } catch (error) {
    logger.error("Failed to add custom domain", { error: error.message });
    return c.json({ error: "Failed to add custom domain" }, 500);
  }
});

// Remove custom domain
apps.delete("/:id/domains/:domain", async (c) => {
  try {
    const user = c.get("user");
    const appId = c.req.param("id");
    const domain = decodeURIComponent(c.req.param("domain"));

    const db = await getDB();
    const app = await db.getAppById(appId);

    if (!app) {
      return c.json({ error: "App not found" }, 404);
    }

    if (app.userId !== user.id) {
      return c.json({ error: "Unauthorized" }, 403);
    }

    // Check if domain exists
    if (!app.customDomains.includes(domain)) {
      return c.json({ error: "Domain not found" }, 404);
    }

    // Remove domain
    const updatedDomains = app.customDomains.filter(d => d !== domain);
    await db.updateApp(appId, { customDomains: updatedDomains });

    // Regenerate Nginx config
    const updatedApp = await db.getAppById(appId);
    if (updatedApp) {
      const nginxManager = getNginxManager();
      await nginxManager.generateAppConfig(updatedApp);
    }

    logger.info(`Custom domain removed: ${domain} from app ${app.name}`);

    return c.json({
      success: true,
      customDomains: updatedDomains
    });
  } catch (error) {
    logger.error("Failed to remove custom domain", { error: error.message });
    return c.json({ error: "Failed to remove custom domain" }, 500);
  }
});

// Get app metrics
apps.get("/:id/metrics", async (c) => {
  try {
    const user = c.get("user");
    const appId = c.req.param("id");
    const db = await getDB();

    const app = await db.getAppById(appId);

    if (!app) {
      return c.json({ error: "App not found" }, 404);
    }

    if (app.userId !== user.id) {
      return c.json({ error: "Unauthorized" }, 403);
    }

    const limit = parseInt(c.req.query("limit") || "100");
    const metrics = await db.getMetricsByApp(appId, limit);

    // Also get current metrics
    const resourceMonitor = getResourceMonitor();
    const currentMetrics = await resourceMonitor.collectAppMetrics(appId);

    return c.json({
      current: currentMetrics,
      history: metrics,
    });
  } catch (error) {
    logger.error("Failed to get metrics", { error: error.message });
    return c.json({ error: "Failed to get metrics" }, 500);
  }
});

// Get system metrics
apps.get("/system/metrics", async (c) => {
  try {
    const user = c.get("user");

    const resourceMonitor = getResourceMonitor();
    const systemMetrics = await resourceMonitor.getSystemMetrics();

    // Get all user's apps resource usage
    const db = await getDB();
    const userApps = await db.getAppsByUser(user.id);

    let totalAppsCpu = 0;
    let totalAppsMemory = 0;

    for (const app of userApps) {
      const appMetrics = await resourceMonitor.collectAppMetrics(app.id);
      if (appMetrics) {
        totalAppsCpu += appMetrics.cpuUsage;
        totalAppsMemory += appMetrics.memoryUsageMB;
      }
    }

    return c.json({
      system: systemMetrics,
      userApps: {
        count: userApps.length,
        totalCpuUsage: totalAppsCpu,
        totalMemoryUsageMB: totalAppsMemory,
      },
    });
  } catch (error) {
    logger.error("Failed to get system metrics", { error: error.message });
    return c.json({ error: "Failed to get system metrics" }, 500);
  }
});

export default apps;
