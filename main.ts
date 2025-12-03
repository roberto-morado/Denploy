import { logger } from "./src/utils/logger.ts";
import { startServer } from "./src/platform/server.ts";
import { closeDB } from "./src/db/kv.ts";
import { getWSManager } from "./src/platform/websocket.ts";
import { isServerless, findDenoPath } from "./src/config.ts";

// Import cron jobs
import "./src/jobs/health-check.ts";
import "./src/jobs/metrics-collection.ts";

async function main(): Promise<void> {
  try {
    logger.info("=".repeat(60));
    logger.info("Denploy - Deploy Deno Apps with Ease");
    logger.info("=".repeat(60));

    // Check for serverless environment
    if (isServerless) {
      logger.error("⚠️  DEPLOYMENT ERROR ⚠️");
      logger.error("");
      logger.error("Denploy cannot run on Deno Deploy or other serverless platforms.");
      logger.error("");
      logger.error("Reasons:");
      logger.error("  - Denploy needs to spawn child processes (not available)");
      logger.error("  - Denploy manages Nginx configurations (requires server access)");
      logger.error("  - Denploy stores app files on disk (requires persistent storage)");
      logger.error("");
      logger.error("Denploy is a SELF-HOSTED platform that must run on:");
      logger.error("  ✓ Your own VPS/server (DigitalOcean, Linode, AWS EC2, etc.)");
      logger.error("  ✓ Local development machine");
      logger.error("  ✓ On-premises server");
      logger.error("");
      logger.error("See DEPLOYMENT.md for setup instructions.");
      logger.error("=".repeat(60));
      Deno.exit(1);
    }

    // Verify Deno runtime is available
    const denoPath = await findDenoPath();
    logger.info(`Deno runtime found at: ${denoPath}`);

    // Test that deno is actually executable
    try {
      const testCommand = new Deno.Command(denoPath, {
        args: ["--version"],
        stdout: "piped",
        stderr: "piped",
      });
      const { success } = await testCommand.output();
      if (!success) {
        throw new Error("Deno executable test failed");
      }
    } catch (error) {
      logger.error("⚠️  DENO RUNTIME ERROR ⚠️");
      logger.error("");
      logger.error(`Cannot execute Deno runtime at: ${denoPath}`);
      logger.error("");
      logger.error("Solutions:");
      logger.error("  1. Make sure Deno is installed: curl -fsSL https://deno.land/install.sh | sh");
      logger.error("  2. Add Deno to your PATH");
      logger.error("  3. Or set DENO_PATH environment variable to the full path");
      logger.error("     Example: DENO_PATH=/home/user/.deno/bin/deno");
      logger.error("");
      logger.error(`Error: ${error.message}`);
      logger.error("=".repeat(60));
      Deno.exit(1);
    }

    // Start the server
    await startServer();
  } catch (error) {
    logger.error("Fatal error", { error: error.message, stack: error.stack });
    Deno.exit(1);
  }
}

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  try {
    // Close WebSocket connections
    const wsManager = getWSManager();
    wsManager.closeAll();

    // Close database
    await closeDB();

    logger.info("Shutdown complete");
    Deno.exit(0);
  } catch (error) {
    logger.error("Error during shutdown", { error: error.message });
    Deno.exit(1);
  }
}

// Register signal handlers
Deno.addSignalListener("SIGINT", () => shutdown("SIGINT"));
Deno.addSignalListener("SIGTERM", () => shutdown("SIGTERM"));

// Handle uncaught errors
globalThis.addEventListener("unhandledrejection", (event) => {
  logger.error("Unhandled rejection", {
    reason: event.reason,
    promise: event.promise,
  });
});

globalThis.addEventListener("error", (event) => {
  logger.error("Uncaught error", {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error,
  });
});

// Start the application
if (import.meta.main) {
  main();
}
