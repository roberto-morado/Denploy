import { load } from "https://deno.land/std@0.224.0/dotenv/mod.ts";

// Load environment variables (allow missing .env file)
let env: Record<string, string> = {};
try {
  env = await load({ allowEmptyValues: true, envPath: ".env", examplePath: null });
} catch {
  // .env file doesn't exist or can't be loaded - use defaults and Deno.env
  env = {};
}

// Helper to get env var with fallback
const getEnv = (key: string, defaultValue: string): string => {
  return env[key] || Deno.env.get(key) || defaultValue;
};

export const config = {
  platform: {
    port: parseInt(getEnv("PLATFORM_PORT", "3000")),
    host: getEnv("PLATFORM_HOST", "0.0.0.0"),
    domain: getEnv("PLATFORM_DOMAIN", "denploy.local"),
  },
  apps: {
    startPort: parseInt(getEnv("APPS_START_PORT", "8001")),
    basePath: getEnv("APPS_BASE_PATH", "./apps"),
  },
  nginx: {
    configPath: getEnv("NGINX_CONFIG_PATH", "./nginx/sites-enabled"),
    templatePath: getEnv("NGINX_TEMPLATE_PATH", "./nginx/templates"),
  },
  security: {
    jwtSecret: getEnv("JWT_SECRET", "change-this-secret-in-production"),
    sessionSecret: getEnv("SESSION_SECRET", "change-this-session-secret"),
  },
  database: {
    kvPath: getEnv("KV_PATH", ""),
  },
  logs: {
    path: getEnv("LOGS_PATH", "./logs"),
    retentionDays: parseInt(getEnv("LOG_RETENTION_DAYS", "7")),
  },
  limits: {
    maxMemoryMB: parseInt(getEnv("MAX_MEMORY_MB", "512")),
    maxCpuCores: parseInt(getEnv("MAX_CPU_CORES", "1")),
    maxDiskMB: parseInt(getEnv("MAX_DISK_MB", "1024")),
    maxUploadSizeMB: parseInt(getEnv("MAX_UPLOAD_SIZE_MB", "50")),
    maxDeploymentsPerApp: parseInt(getEnv("MAX_DEPLOYMENTS_PER_APP", "10")),
  },
};

// Detect if running on Deno Deploy (or other serverless)
export const isServerless = (() => {
  const deployEnv = Deno.env.get("DENO_DEPLOYMENT_ID");
  return deployEnv !== undefined;
})();

export type Config = typeof config;
