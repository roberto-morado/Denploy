// User model
export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  sshPublicKeys: string[];
  apiToken?: string;
  isActive: boolean;
}

// App model
export interface App {
  id: string;
  userId: string;
  name: string;
  subdomain: string;
  customDomains: string[]; // Custom domains pointing to this app
  createdAt: Date;
  updatedAt: Date;
  status: AppStatus;
  port: number;
  processId?: number;
  envVars: Record<string, string>;
  currentDeploymentId?: string;
}

export type AppStatus = "stopped" | "running" | "building" | "error" | "crashed";

// Deployment model
export interface Deployment {
  id: string;
  appId: string;
  version: number;
  deployedAt: Date;
  deployedBy: string;
  status: DeploymentStatus;
  commitHash?: string;
  buildLogs: string;
  filePath: string;
  fileType: "single" | "zip";
  errorMessage?: string;
}

export type DeploymentStatus = "pending" | "building" | "active" | "inactive" | "failed";

// SSH Key model
export interface SSHKey {
  id: string;
  userId: string;
  name: string;
  publicKey: string;
  fingerprint: string;
  createdAt: Date;
}

// Session model
export interface Session {
  id: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  userAgent?: string;
  ipAddress?: string;
}

// Log Entry model
export interface LogEntry {
  id: string;
  appId: string;
  timestamp: Date;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  metadata?: Record<string, unknown>;
}

// Port Assignment model
export interface PortAssignment {
  port: number;
  appId: string;
  assignedAt: Date;
}

// App Metrics model
export interface AppMetrics {
  appId: string;
  timestamp: Date;
  cpuUsage: number;
  memoryUsageMB: number;
  diskUsageMB: number;
  requestCount: number;
  errorCount: number;
}

// Webhook model
export interface Webhook {
  id: string;
  appId: string;
  provider: "github" | "gitlab" | "bitbucket" | "custom";
  secret: string;
  branch?: string;
  events: string[];
  createdAt: Date;
  lastTriggeredAt?: Date;
  isActive: boolean;
}

// Organization/Team model
export interface Organization {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationMember {
  organizationId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  joinedAt: Date;
}
