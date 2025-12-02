import { getDB } from "../db/kv.ts";
import { getProcessManager } from "../core/process-manager.ts";
import { getFileManager } from "../core/file-manager.ts";
import { logger } from "../utils/logger.ts";

export async function healthCheckJob(): Promise<void> {
  try {
    const db = await getDB();
    const processManager = getProcessManager();
    const fileManager = getFileManager();

    logger.info("Running health check job");

    // Get all apps
    const processes = processManager.getAllProcesses();

    for (const [appId, appProcess] of processes) {
      const app = await db.getAppById(appId);

      if (!app) {
        logger.warn(`App ${appId} not found in database, stopping process`);
        await processManager.stopApp(appId);
        continue;
      }

      // Check if process is still running
      try {
        // Try to ping the app (if it has a health endpoint)
        const response = await fetch(`http://localhost:${app.port}/health`, {
          signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
          logger.debug(`App ${app.name} is healthy`);
        } else {
          logger.warn(`App ${app.name} health check failed with status ${response.status}`);
        }
      } catch (error) {
        logger.warn(`App ${app.name} health check failed: ${error.message}`);

        // Check if process is actually dead
        if (!processManager.isRunning(appId)) {
          logger.error(`App ${app.name} process is dead, marking as crashed`);
          await db.updateApp(appId, { status: "crashed" });
        }
      }
    }

    // Check for apps that should be running but aren't
    const allProcesses = processManager.getAllProcesses();
    const runningAppIds = new Set(Array.from(allProcesses.keys()));

    // You could implement auto-restart here if desired
    // For now, we just log the issue

    logger.info("Health check job completed");
  } catch (error) {
    logger.error("Health check job failed", { error: error.message });
  }
}

// Schedule the health check job (every 1 minute)
Deno.cron("health_check", "*/1 * * * *", healthCheckJob);
