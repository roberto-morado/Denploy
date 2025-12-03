import { join } from "@std/path";
import { logger } from "../utils/logger.ts";
import { getDB } from "../db/kv.ts";
import type { App, LogEntry } from "../db/models.ts";
import { v4 } from "@std/uuid";

interface AppProcess {
  process: Deno.ChildProcess;
  appId: string;
  startedAt: Date;
}

export class ProcessManager {
  private processes: Map<string, AppProcess>;
  private logStreams: Map<string, ReadableStreamDefaultReader<Uint8Array>>;

  constructor() {
    this.processes = new Map();
    this.logStreams = new Map();
  }

  async startApp(app: App, appPath: string): Promise<void> {
    try {
      // Stop existing process if running
      if (this.processes.has(app.id)) {
        await this.stopApp(app.id);
      }

      const mainFile = join(appPath, "main.ts");

      logger.info(`Starting app ${app.name} (${app.id}) on port ${app.port}`);

      // Start Deno process
      const command = new Deno.Command("deno", {
        args: [
          "run",
          "--allow-net",
          "--allow-read",
          "--allow-write",
          "--allow-env",
          mainFile,
        ],
        env: {
          PORT: app.port.toString(),
          APP_NAME: app.name,
          APP_ID: app.id,
          ...app.envVars,
        },
        stdout: "piped",
        stderr: "piped",
      });

      const process = command.spawn();

      // Store process
      this.processes.set(app.id, {
        process,
        appId: app.id,
        startedAt: new Date(),
      });

      // Capture stdout
      this.captureOutput(app.id, process.stdout, "info");

      // Capture stderr
      this.captureOutput(app.id, process.stderr, "error");

      // Monitor process exit
      this.monitorProcess(app.id, process);

      // Update app status
      const db = await getDB();
      await db.updateApp(app.id, {
        status: "running",
        processId: process.pid,
      });

      logger.info(`App ${app.name} started successfully with PID ${process.pid}`);
    } catch (error) {
      logger.error(`Failed to start app ${app.id}`, { error: error.message });

      const db = await getDB();
      await db.updateApp(app.id, {
        status: "error",
      });

      throw error;
    }
  }

  async stopApp(appId: string): Promise<void> {
    const appProcess = this.processes.get(appId);

    if (!appProcess) {
      logger.warn(`App ${appId} is not running`);
      return;
    }

    try {
      logger.info(`Stopping app ${appId}`);

      // Kill the process
      appProcess.process.kill("SIGTERM");

      // Wait for graceful shutdown (max 10 seconds)
      const timeout = setTimeout(() => {
        logger.warn(`App ${appId} did not stop gracefully, force killing`);
        appProcess.process.kill("SIGKILL");
      }, 10000);

      await appProcess.process.status;
      clearTimeout(timeout);

      // Clean up
      this.processes.delete(appId);
      this.logStreams.get(appId)?.cancel();
      this.logStreams.delete(appId);

      // Update app status
      const db = await getDB();
      await db.updateApp(appId, {
        status: "stopped",
        processId: undefined,
      });

      logger.info(`App ${appId} stopped successfully`);
    } catch (error) {
      logger.error(`Failed to stop app ${appId}`, { error: error.message });
      throw error;
    }
  }

  async restartApp(app: App, appPath: string): Promise<void> {
    await this.stopApp(app.id);
    await this.startApp(app, appPath);
  }

  isRunning(appId: string): boolean {
    return this.processes.has(appId);
  }

  getProcess(appId: string): AppProcess | undefined {
    return this.processes.get(appId);
  }

  getAllProcesses(): Map<string, AppProcess> {
    return this.processes;
  }

  private async captureOutput(
    appId: string,
    stream: ReadableStream<Uint8Array>,
    level: "info" | "error"
  ): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    const db = await getDB();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split("\n").filter(line => line.trim());

        for (const line of lines) {
          // Log to console
          if (level === "error") {
            logger.error(`[App ${appId}] ${line}`);
          } else {
            logger.info(`[App ${appId}] ${line}`);
          }

          // Store in database
          const logEntry: LogEntry = {
            id: v4.generate() as string,
            appId,
            timestamp: new Date(),
            level: level === "error" ? "error" : "info",
            message: line,
          };

          await db.addLog(logEntry);
        }
      }
    } catch (error) {
      logger.error(`Error capturing output for app ${appId}`, { error: error.message });
    }
  }

  private async monitorProcess(appId: string, process: Deno.ChildProcess): Promise<void> {
    try {
      const status = await process.status;

      logger.info(`App ${appId} exited with code ${status.code}`);

      this.processes.delete(appId);

      const db = await getDB();
      await db.updateApp(appId, {
        status: status.success ? "stopped" : "crashed",
        processId: undefined,
      });
    } catch (error) {
      logger.error(`Error monitoring process for app ${appId}`, { error: error.message });
    }
  }
}

// Singleton instance
let processManagerInstance: ProcessManager | null = null;

export function getProcessManager(): ProcessManager {
  if (!processManagerInstance) {
    processManagerInstance = new ProcessManager();
  }
  return processManagerInstance;
}
