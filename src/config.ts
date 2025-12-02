import { load } from "https://deno.land/std@0.224.0/dotenv/mod.ts";

// Load environment variables
const env = await load();

export const config = {
  platform: {
    port: parseInt(env.PLATFORM_PORT || "3000"),
    host: env.PLATFORM_HOST || "localhost",
    domain: env.PLATFORM_DOMAIN || "denploy.local",
  },
  apps: {
    startPort: parseInt(env.APPS_START_PORT || "8001"),
    basePath: env.APPS_BASE_PATH || "./apps",
  },
  nginx: {
    configPath: env.NGINX_CONFIG_PATH || "./nginx/sites-enabled",
    templatePath: env.NGINX_TEMPLATE_PATH || "./nginx/templates",
  },
  security: {
    jwtSecret: env.JWT_SECRET || "change-this-secret-in-production",
    sessionSecret: env.SESSION_SECRET || "change-this-session-secret",
  },
  database: {
    kvPath: env.KV_PATH,
  },
  logs: {
    path: env.LOGS_PATH || "./logs",
    retentionDays: parseInt(env.LOG_RETENTION_DAYS || "7"),
  },
  limits: {
    maxMemoryMB: parseInt(env.MAX_MEMORY_MB || "512"),
    maxCpuCores: parseInt(env.MAX_CPU_CORES || "1"),
    maxDiskMB: parseInt(env.MAX_DISK_MB || "1024"),
    maxUploadSizeMB: parseInt(env.MAX_UPLOAD_SIZE_MB || "50"),
    maxDeploymentsPerApp: parseInt(env.MAX_DEPLOYMENTS_PER_APP || "10"),
  },
};

export type Config = typeof config;
