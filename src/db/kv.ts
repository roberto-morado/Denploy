import { config } from "../config.ts";
import type {
  App,
  AppMetrics,
  Deployment,
  LogEntry,
  PortAssignment,
  Session,
  SSHKey,
  User,
} from "./models.ts";

export class KVDatabase {
  private kv: Deno.Kv;

  private constructor(kv: Deno.Kv) {
    this.kv = kv;
  }

  static async open(): Promise<KVDatabase> {
    const kv = await Deno.openKv(config.database.kvPath);
    return new KVDatabase(kv);
  }

  async close(): Promise<void> {
    await this.kv.close();
  }

  // User operations
  async createUser(user: User): Promise<void> {
    const atomic = this.kv.atomic()
      .check({ key: ["users", user.id], versionstamp: null })
      .check({ key: ["users_by_email", user.email], versionstamp: null })
      .set(["users", user.id], user)
      .set(["users_by_email", user.email], user.id);

    const result = await atomic.commit();
    if (!result.ok) {
      throw new Error("User already exists");
    }
  }

  async getUserById(userId: string): Promise<User | null> {
    const result = await this.kv.get<User>(["users", userId]);
    return result.value;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const userIdResult = await this.kv.get<string>(["users_by_email", email]);
    if (!userIdResult.value) return null;
    return this.getUserById(userIdResult.value);
  }

  async updateUser(userId: string, updates: Partial<User>): Promise<void> {
    const user = await this.getUserById(userId);
    if (!user) throw new Error("User not found");

    const updatedUser = { ...user, ...updates, updatedAt: new Date() };
    await this.kv.set(["users", userId], updatedUser);
  }

  async deleteUser(userId: string): Promise<void> {
    const user = await this.getUserById(userId);
    if (!user) return;

    await this.kv.atomic()
      .delete(["users", userId])
      .delete(["users_by_email", user.email])
      .commit();
  }

  // App operations
  async createApp(app: App): Promise<void> {
    const atomic = this.kv.atomic()
      .check({ key: ["apps", app.id], versionstamp: null })
      .check({ key: ["apps_by_subdomain", app.subdomain], versionstamp: null })
      .set(["apps", app.id], app)
      .set(["apps_by_user", app.userId, app.id], app)
      .set(["apps_by_subdomain", app.subdomain], app.id);

    const result = await atomic.commit();
    if (!result.ok) {
      throw new Error("App already exists or subdomain taken");
    }
  }

  async getAppById(appId: string): Promise<App | null> {
    const result = await this.kv.get<App>(["apps", appId]);
    return result.value;
  }

  async getAppBySubdomain(subdomain: string): Promise<App | null> {
    const appIdResult = await this.kv.get<string>(["apps_by_subdomain", subdomain]);
    if (!appIdResult.value) return null;
    return this.getAppById(appIdResult.value);
  }

  async getAppsByUser(userId: string): Promise<App[]> {
    const apps: App[] = [];
    const iter = this.kv.list<App>({ prefix: ["apps_by_user", userId] });

    for await (const entry of iter) {
      apps.push(entry.value);
    }

    return apps;
  }

  async updateApp(appId: string, updates: Partial<App>): Promise<void> {
    const app = await this.getAppById(appId);
    if (!app) throw new Error("App not found");

    const updatedApp = { ...app, ...updates, updatedAt: new Date() };

    await this.kv.atomic()
      .set(["apps", appId], updatedApp)
      .set(["apps_by_user", app.userId, appId], updatedApp)
      .commit();
  }

  async deleteApp(appId: string): Promise<void> {
    const app = await this.getAppById(appId);
    if (!app) return;

    await this.kv.atomic()
      .delete(["apps", appId])
      .delete(["apps_by_user", app.userId, appId])
      .delete(["apps_by_subdomain", app.subdomain])
      .commit();
  }

  // Deployment operations
  async createDeployment(deployment: Deployment): Promise<void> {
    await this.kv.atomic()
      .set(["deployments", deployment.id], deployment)
      .set(["deployments_by_app", deployment.appId, deployment.id], deployment)
      .commit();
  }

  async getDeploymentById(deploymentId: string): Promise<Deployment | null> {
    const result = await this.kv.get<Deployment>(["deployments", deploymentId]);
    return result.value;
  }

  async getDeploymentsByApp(appId: string, limit = 10): Promise<Deployment[]> {
    const deployments: Deployment[] = [];
    const iter = this.kv.list<Deployment>({
      prefix: ["deployments_by_app", appId],
    }, {
      limit,
      reverse: true, // Get newest first
    });

    for await (const entry of iter) {
      deployments.push(entry.value);
    }

    return deployments;
  }

  async updateDeployment(deploymentId: string, updates: Partial<Deployment>): Promise<void> {
    const deployment = await this.getDeploymentById(deploymentId);
    if (!deployment) throw new Error("Deployment not found");

    const updatedDeployment = { ...deployment, ...updates };

    await this.kv.atomic()
      .set(["deployments", deploymentId], updatedDeployment)
      .set(["deployments_by_app", deployment.appId, deploymentId], updatedDeployment)
      .commit();
  }

  // Session operations
  async createSession(session: Session): Promise<void> {
    await this.kv.set(["sessions", session.id], session, {
      expireIn: session.expiresAt.getTime() - Date.now(),
    });
  }

  async getSession(sessionId: string): Promise<Session | null> {
    const result = await this.kv.get<Session>(["sessions", sessionId]);
    return result.value;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.kv.delete(["sessions", sessionId]);
  }

  // SSH Key operations
  async createSSHKey(sshKey: SSHKey): Promise<void> {
    await this.kv.set(["ssh_keys", sshKey.userId, sshKey.id], sshKey);
  }

  async getSSHKeysByUser(userId: string): Promise<SSHKey[]> {
    const keys: SSHKey[] = [];
    const iter = this.kv.list<SSHKey>({ prefix: ["ssh_keys", userId] });

    for await (const entry of iter) {
      keys.push(entry.value);
    }

    return keys;
  }

  async deleteSSHKey(userId: string, keyId: string): Promise<void> {
    await this.kv.delete(["ssh_keys", userId, keyId]);
  }

  // Port Assignment operations
  async assignPort(port: number, appId: string): Promise<void> {
    const assignment: PortAssignment = {
      port,
      appId,
      assignedAt: new Date(),
    };

    await this.kv.set(["port_assignments", port], assignment);
  }

  async getPortAssignment(port: number): Promise<PortAssignment | null> {
    const result = await this.kv.get<PortAssignment>(["port_assignments", port]);
    return result.value;
  }

  async releasePort(port: number): Promise<void> {
    await this.kv.delete(["port_assignments", port]);
  }

  async getNextAvailablePort(startPort: number): Promise<number> {
    let port = startPort;

    while (true) {
      const assignment = await this.getPortAssignment(port);
      if (!assignment) {
        return port;
      }
      port++;

      // Safety check: don't go beyond reasonable port range
      if (port > 65535) {
        throw new Error("No available ports");
      }
    }
  }

  // Log operations (with TTL)
  async addLog(log: LogEntry): Promise<void> {
    const ttl = config.logs.retentionDays * 24 * 60 * 60 * 1000; // Convert days to ms
    await this.kv.set(
      ["logs", log.appId, log.timestamp.getTime(), log.id],
      log,
      { expireIn: ttl }
    );
  }

  async getLogsByApp(appId: string, limit = 100): Promise<LogEntry[]> {
    const logs: LogEntry[] = [];
    const iter = this.kv.list<LogEntry>({
      prefix: ["logs", appId],
    }, {
      limit,
      reverse: true, // Newest first
    });

    for await (const entry of iter) {
      logs.push(entry.value);
    }

    return logs;
  }

  // Metrics operations (with TTL)
  async saveMetrics(metrics: AppMetrics): Promise<void> {
    const ttl = 7 * 24 * 60 * 60 * 1000; // 7 days
    await this.kv.set(
      ["metrics", metrics.appId, metrics.timestamp.getTime()],
      metrics,
      { expireIn: ttl }
    );
  }

  async getMetricsByApp(appId: string, limit = 100): Promise<AppMetrics[]> {
    const metrics: AppMetrics[] = [];
    const iter = this.kv.list<AppMetrics>({
      prefix: ["metrics", appId],
    }, {
      limit,
      reverse: true,
    });

    for await (const entry of iter) {
      metrics.push(entry.value);
    }

    return metrics;
  }
}

// Singleton instance
let dbInstance: KVDatabase | null = null;

export async function getDB(): Promise<KVDatabase> {
  if (!dbInstance) {
    dbInstance = await KVDatabase.open();
  }
  return dbInstance;
}

export async function closeDB(): Promise<void> {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
  }
}
