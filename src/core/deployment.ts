import { v4 } from "@std/uuid";
import { getDB } from "../db/kv.ts";
import { getFileManager } from "./file-manager.ts";
import { getProcessManager } from "./process-manager.ts";
import { getNginxManager } from "./nginx-manager.ts";
import { logger } from "../utils/logger.ts";
import type { App, Deployment } from "../db/models.ts";
import { config } from "../config.ts";

export interface DeploymentOptions {
  fileData: Uint8Array;
  fileName: string;
  fileType: "single" | "zip";
  deployedBy: string;
}

export class DeploymentService {
  async deployApp(app: App, options: DeploymentOptions): Promise<Deployment> {
    const db = await getDB();
    const fileManager = getFileManager();
    const processManager = getProcessManager();

    const deploymentId = v4.generate() as string;

    // Get next version number
    const previousDeployments = await db.getDeploymentsByApp(app.id);
    const version = previousDeployments.length + 1;

    // Create deployment record
    const deployment: Deployment = {
      id: deploymentId,
      appId: app.id,
      version,
      deployedAt: new Date(),
      deployedBy: options.deployedBy,
      status: "building",
      fileType: options.fileType,
      filePath: "",
      buildLogs: "",
    };

    try {
      await db.createDeployment(deployment);
      await db.updateApp(app.id, { status: "building" });

      logger.info(`Starting deployment ${deploymentId} for app ${app.name}`);

      // Create deployment directory
      const deploymentPath = await fileManager.createDeploymentDirectory(
        app.userId,
        app.name,
        deploymentId
      );

      deployment.filePath = deploymentPath;

      // Handle file based on type
      if (options.fileType === "single") {
        // Single main.ts file
        const mainPath = `${deploymentPath}/main.ts`;
        await Deno.writeFile(mainPath, options.fileData);
        logger.info(`Saved single file deployment to ${mainPath}`);
      } else if (options.fileType === "zip") {
        // ZIP file - extract it
        const zipPath = await fileManager.saveUploadedFile(
          app.userId,
          app.name,
          options.fileData,
          options.fileName
        );

        await fileManager.extractZip(zipPath, deploymentPath);
        logger.info(`Extracted ZIP deployment to ${deploymentPath}`);

        // Clean up ZIP file
        await Deno.remove(zipPath);
      }

      // Validate main.ts exists
      const hasMainFile = await fileManager.validateMainFile(deploymentPath);

      if (!hasMainFile) {
        throw new Error("main.ts not found in deployment");
      }

      // Activate this deployment
      const currentPath = await fileManager.activateDeployment(
        app.userId,
        app.name,
        deploymentId
      );

      // Update deployment status
      deployment.status = "active";
      deployment.buildLogs = "Build completed successfully";
      await db.updateDeployment(deploymentId, {
        status: "active",
        buildLogs: "Build completed successfully",
      });

      // Mark previous deployments as inactive
      for (const prevDeployment of previousDeployments) {
        if (prevDeployment.status === "active") {
          await db.updateDeployment(prevDeployment.id, { status: "inactive" });
        }
      }

      // Update app with current deployment
      await db.updateApp(app.id, {
        currentDeploymentId: deploymentId,
        status: "stopped",
      });

      // Start/restart the app
      await processManager.restartApp(app, currentPath);

      logger.info(`Deployment ${deploymentId} completed successfully`);

      // Clean up old deployments if exceeding limit
      await this.cleanupOldDeployments(app.id);

      return deployment;
    } catch (error) {
      logger.error(`Deployment ${deploymentId} failed`, { error: error.message });

      deployment.status = "failed";
      deployment.errorMessage = error.message;
      deployment.buildLogs = `Build failed: ${error.message}`;

      await db.updateDeployment(deploymentId, {
        status: "failed",
        errorMessage: error.message,
        buildLogs: `Build failed: ${error.message}`,
      });

      await db.updateApp(app.id, { status: "error" });

      throw error;
    }
  }

  async rollbackDeployment(appId: string, deploymentId: string): Promise<void> {
    const db = await getDB();
    const fileManager = getFileManager();
    const processManager = getProcessManager();

    try {
      const app = await db.getAppById(appId);
      if (!app) throw new Error("App not found");

      const deployment = await db.getDeploymentById(deploymentId);
      if (!deployment) throw new Error("Deployment not found");

      if (deployment.status !== "inactive") {
        throw new Error("Can only rollback to inactive deployments");
      }

      logger.info(`Rolling back app ${app.name} to deployment ${deploymentId}`);

      // Activate the target deployment
      const currentPath = await fileManager.activateDeployment(
        app.userId,
        app.name,
        deploymentId
      );

      // Update deployment statuses
      const deployments = await db.getDeploymentsByApp(appId);
      for (const dep of deployments) {
        if (dep.id === deploymentId) {
          await db.updateDeployment(dep.id, { status: "active" });
        } else if (dep.status === "active") {
          await db.updateDeployment(dep.id, { status: "inactive" });
        }
      }

      // Update app
      await db.updateApp(appId, {
        currentDeploymentId: deploymentId,
      });

      // Restart app
      await processManager.restartApp(app, currentPath);

      logger.info(`Rollback to deployment ${deploymentId} completed`);
    } catch (error) {
      logger.error("Rollback failed", { error: error.message });
      throw error;
    }
  }

  private async cleanupOldDeployments(appId: string): Promise<void> {
    try {
      const db = await getDB();
      const fileManager = getFileManager();

      const deployments = await db.getDeploymentsByApp(appId);

      // Keep only the last N deployments
      const maxDeployments = config.limits.maxDeploymentsPerApp;

      if (deployments.length > maxDeployments) {
        const toDelete = deployments.slice(maxDeployments);

        for (const deployment of toDelete) {
          // Don't delete active deployment
          if (deployment.status === "active") continue;

          const app = await db.getAppById(appId);
          if (!app) continue;

          await fileManager.deleteDeployment(app.userId, app.name, deployment.id);
          logger.info(`Cleaned up old deployment ${deployment.id}`);
        }
      }
    } catch (error) {
      logger.error("Failed to cleanup old deployments", { error: error.message });
      // Don't throw - this is a cleanup operation
    }
  }
}

// Singleton instance
let deploymentServiceInstance: DeploymentService | null = null;

export function getDeploymentService(): DeploymentService {
  if (!deploymentServiceInstance) {
    deploymentServiceInstance = new DeploymentService();
  }
  return deploymentServiceInstance;
}
