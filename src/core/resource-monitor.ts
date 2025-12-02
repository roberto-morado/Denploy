import { getDB } from "../db/kv.ts";
import { getProcessManager } from "./process-manager.ts";
import { getFileManager } from "./file-manager.ts";
import { logger } from "../utils/logger.ts";
import type { AppMetrics } from "../db/models.ts";
import { v4 as uuidv4 } from "@std/uuid";

export class ResourceMonitor {
  /**
   * Collect metrics for a specific app
   */
  async collectAppMetrics(appId: string): Promise<AppMetrics | null> {
    try {
      const db = await getDB();
      const app = await db.getAppById(appId);

      if (!app) {
        return null;
      }

      const processManager = getProcessManager();
      const appProcess = processManager.getProcess(appId);

      if (!appProcess || !appProcess.process.pid) {
        // App is not running, return zero metrics
        return {
          appId,
          timestamp: new Date(),
          cpuUsage: 0,
          memoryUsageMB: 0,
          diskUsageMB: 0,
          requestCount: 0,
          errorCount: 0,
        };
      }

      const pid = appProcess.process.pid;

      // Get CPU and memory usage
      const { cpuUsage, memoryUsageMB } = await this.getProcessStats(pid);

      // Get disk usage
      const fileManager = getFileManager();
      const appPath = fileManager.getAppPath(app.userId, app.name);
      const diskUsageBytes = await fileManager.getDirectorySize(appPath);
      const diskUsageMB = diskUsageBytes / (1024 * 1024);

      const metrics: AppMetrics = {
        appId,
        timestamp: new Date(),
        cpuUsage,
        memoryUsageMB,
        diskUsageMB,
        requestCount: 0, // TODO: Implement request counting via middleware
        errorCount: 0, // TODO: Implement error counting from logs
      };

      return metrics;
    } catch (error) {
      logger.error(`Failed to collect metrics for app ${appId}`, { error: error.message });
      return null;
    }
  }

  /**
   * Collect metrics for all running apps
   */
  async collectAllMetrics(): Promise<void> {
    try {
      const processManager = getProcessManager();
      const runningProcesses = processManager.getAllProcesses();

      logger.info(`Collecting metrics for ${runningProcesses.size} running apps`);

      const db = await getDB();

      for (const [appId, _process] of runningProcesses) {
        const metrics = await this.collectAppMetrics(appId);

        if (metrics) {
          await db.saveMetrics(metrics);
          logger.debug(`Saved metrics for app ${appId}`, {
            cpu: metrics.cpuUsage.toFixed(2),
            memory: metrics.memoryUsageMB.toFixed(2),
          });
        }
      }
    } catch (error) {
      logger.error("Failed to collect all metrics", { error: error.message });
    }
  }

  /**
   * Get process CPU and memory usage using /proc filesystem (Linux)
   */
  private async getProcessStats(pid: number): Promise<{
    cpuUsage: number;
    memoryUsageMB: number;
  }> {
    try {
      // Try using ps command (works on most Unix systems)
      const command = new Deno.Command("ps", {
        args: ["-p", pid.toString(), "-o", "%cpu,%mem,rss", "--no-headers"],
        stdout: "piped",
        stderr: "piped",
      });

      const process = command.spawn();
      const { stdout } = await process.output();
      const output = new TextDecoder().decode(stdout).trim();

      if (!output) {
        return { cpuUsage: 0, memoryUsageMB: 0 };
      }

      // Parse output: CPU% MEM% RSS(kb)
      const parts = output.split(/\s+/);
      const cpuUsage = parseFloat(parts[0]) || 0;
      const rssKB = parseInt(parts[2]) || 0;
      const memoryUsageMB = rssKB / 1024;

      return { cpuUsage, memoryUsageMB };
    } catch (error) {
      logger.warn(`Failed to get process stats for PID ${pid}`, { error: error.message });

      // Fallback: try reading /proc directly (Linux only)
      try {
        return await this.getProcessStatsFromProc(pid);
      } catch {
        return { cpuUsage: 0, memoryUsageMB: 0 };
      }
    }
  }

  /**
   * Get process stats from /proc filesystem (Linux only)
   */
  private async getProcessStatsFromProc(pid: number): Promise<{
    cpuUsage: number;
    memoryUsageMB: number;
  }> {
    try {
      // Read memory info from /proc/[pid]/status
      const statusFile = `/proc/${pid}/status`;
      const statusContent = await Deno.readTextFile(statusFile);

      // Extract VmRSS (Resident Set Size)
      const vmRssMatch = statusContent.match(/VmRSS:\s+(\d+)\s+kB/);
      const memoryKB = vmRssMatch ? parseInt(vmRssMatch[1]) : 0;
      const memoryUsageMB = memoryKB / 1024;

      // For CPU usage, we'd need to calculate it over time
      // This is a simplified version - just return memory for now
      return {
        cpuUsage: 0, // Would need historical data to calculate
        memoryUsageMB,
      };
    } catch {
      return { cpuUsage: 0, memoryUsageMB: 0 };
    }
  }

  /**
   * Get system-wide resource usage
   */
  async getSystemMetrics(): Promise<{
    totalMemoryMB: number;
    usedMemoryMB: number;
    freeMemoryMB: number;
    cpuCount: number;
    uptime: number;
  }> {
    try {
      // Get system memory info
      const memInfo = Deno.systemMemoryInfo();

      const totalMemoryMB = memInfo.total / (1024 * 1024);
      const freeMemoryMB = memInfo.free / (1024 * 1024);
      const usedMemoryMB = totalMemoryMB - freeMemoryMB;

      // Get CPU count
      const cpuCount = navigator.hardwareConcurrency || 1;

      // Get system uptime (Linux only)
      let uptime = 0;
      try {
        const uptimeContent = await Deno.readTextFile("/proc/uptime");
        uptime = parseFloat(uptimeContent.split(" ")[0]);
      } catch {
        // Not available on this system
      }

      return {
        totalMemoryMB,
        usedMemoryMB,
        freeMemoryMB,
        cpuCount,
        uptime,
      };
    } catch (error) {
      logger.error("Failed to get system metrics", { error: error.message });
      return {
        totalMemoryMB: 0,
        usedMemoryMB: 0,
        freeMemoryMB: 0,
        cpuCount: 1,
        uptime: 0,
      };
    }
  }
}

// Singleton instance
let resourceMonitorInstance: ResourceMonitor | null = null;

export function getResourceMonitor(): ResourceMonitor {
  if (!resourceMonitorInstance) {
    resourceMonitorInstance = new ResourceMonitor();
  }
  return resourceMonitorInstance;
}
