import { getResourceMonitor } from "../core/resource-monitor.ts";
import { logger } from "../utils/logger.ts";

export async function metricsCollectionJob(): Promise<void> {
  try {
    logger.debug("Running metrics collection job");

    const resourceMonitor = getResourceMonitor();
    await resourceMonitor.collectAllMetrics();

    logger.debug("Metrics collection job completed");
  } catch (error) {
    logger.error("Metrics collection job failed", { error: error.message });
  }
}

// Schedule metrics collection every 5 minutes
Deno.cron("metrics_collection", "*/5 * * * *", metricsCollectionJob);
