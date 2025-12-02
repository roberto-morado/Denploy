import { join } from "@std/path";
import { ensureDir, exists } from "@std/fs";
import { decompress } from "https://deno.land/x/zip@v1.2.5/mod.ts";
import { config } from "../config.ts";
import { logger } from "../utils/logger.ts";

export class FileManager {
  async saveUploadedFile(
    userId: string,
    appName: string,
    fileData: Uint8Array,
    fileName: string
  ): Promise<string> {
    try {
      const appPath = this.getAppPath(userId, appName);
      await ensureDir(appPath);

      const filePath = join(appPath, fileName);
      await Deno.writeFile(filePath, fileData);

      logger.info(`Saved uploaded file: ${filePath}`);
      return filePath;
    } catch (error) {
      logger.error("Failed to save uploaded file", { error: error.message });
      throw error;
    }
  }

  async extractZip(zipPath: string, targetDir: string): Promise<void> {
    try {
      await ensureDir(targetDir);
      await decompress(zipPath, targetDir);
      logger.info(`Extracted ZIP to: ${targetDir}`);
    } catch (error) {
      logger.error("Failed to extract ZIP", { error: error.message });
      throw error;
    }
  }

  async copyFile(sourcePath: string, targetPath: string): Promise<void> {
    try {
      const data = await Deno.readFile(sourcePath);
      await ensureDir(join(targetPath, ".."));
      await Deno.writeFile(targetPath, data);
      logger.info(`Copied file from ${sourcePath} to ${targetPath}`);
    } catch (error) {
      logger.error("Failed to copy file", { error: error.message });
      throw error;
    }
  }

  async createDeploymentDirectory(
    userId: string,
    appName: string,
    deploymentId: string
  ): Promise<string> {
    const deploymentPath = join(
      config.apps.basePath,
      userId,
      appName,
      "releases",
      deploymentId
    );
    await ensureDir(deploymentPath);
    return deploymentPath;
  }

  async activateDeployment(
    userId: string,
    appName: string,
    deploymentId: string
  ): Promise<string> {
    const currentPath = join(config.apps.basePath, userId, appName, "current");
    const releasePath = join(
      config.apps.basePath,
      userId,
      appName,
      "releases",
      deploymentId
    );

    // Remove existing current symlink/directory
    if (await exists(currentPath)) {
      await Deno.remove(currentPath, { recursive: true });
    }

    // Create symlink to new deployment
    await Deno.symlink(releasePath, currentPath);

    logger.info(`Activated deployment ${deploymentId} for app ${appName}`);
    return currentPath;
  }

  async validateMainFile(directoryPath: string): Promise<boolean> {
    const mainPath = join(directoryPath, "main.ts");
    return await exists(mainPath);
  }

  async deleteAppFiles(userId: string, appName: string): Promise<void> {
    const appPath = this.getAppPath(userId, appName);

    if (await exists(appPath)) {
      await Deno.remove(appPath, { recursive: true });
      logger.info(`Deleted app files: ${appPath}`);
    }
  }

  async deleteDeployment(
    userId: string,
    appName: string,
    deploymentId: string
  ): Promise<void> {
    const deploymentPath = join(
      config.apps.basePath,
      userId,
      appName,
      "releases",
      deploymentId
    );

    if (await exists(deploymentPath)) {
      await Deno.remove(deploymentPath, { recursive: true });
      logger.info(`Deleted deployment: ${deploymentPath}`);
    }
  }

  getAppPath(userId: string, appName: string): string {
    return join(config.apps.basePath, userId, appName);
  }

  getCurrentDeploymentPath(userId: string, appName: string): string {
    return join(config.apps.basePath, userId, appName, "current");
  }

  async getDirectorySize(path: string): Promise<number> {
    let totalSize = 0;

    try {
      for await (const entry of Deno.readDir(path)) {
        const entryPath = join(path, entry.name);

        if (entry.isDirectory) {
          totalSize += await this.getDirectorySize(entryPath);
        } else if (entry.isFile) {
          const stat = await Deno.stat(entryPath);
          totalSize += stat.size;
        }
      }
    } catch (error) {
      logger.error("Failed to get directory size", { error: error.message });
    }

    return totalSize;
  }
}

// Singleton instance
let fileManagerInstance: FileManager | null = null;

export function getFileManager(): FileManager {
  if (!fileManagerInstance) {
    fileManagerInstance = new FileManager();
  }
  return fileManagerInstance;
}
