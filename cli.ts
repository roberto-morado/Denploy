#!/usr/bin/env -S deno run --allow-net --allow-read --allow-write --allow-env

/**
 * Denploy CLI - Command-line tool for deploying apps to Denploy
 *
 * Installation:
 *   deno install --allow-net --allow-read --allow-write --allow-env -n denploy https://your-domain.com/cli.ts
 *
 * Usage:
 *   denploy login
 *   denploy apps list
 *   denploy apps create my-app
 *   denploy deploy ./my-app
 *   denploy logs my-app
 */

import { parse } from "https://deno.land/std@0.224.0/flags/mod.ts";
import { join } from "@std/path";
import { exists } from "@std/fs";

const VERSION = "0.1.0";
const CONFIG_DIR = join(Deno.env.get("HOME") || "~", ".denploy");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

interface Config {
  apiUrl: string;
  token?: string;
  email?: string;
}

class DenployCLI {
  private config: Config;

  constructor() {
    this.config = {
      apiUrl: "http://localhost:3000",
    };
  }

  async loadConfig(): Promise<void> {
    try {
      if (await exists(CONFIG_FILE)) {
        const data = await Deno.readTextFile(CONFIG_FILE);
        this.config = JSON.parse(data);
      }
    } catch (error) {
      // Config doesn't exist yet
    }
  }

  async saveConfig(): Promise<void> {
    await Deno.mkdir(CONFIG_DIR, { recursive: true });
    await Deno.writeTextFile(CONFIG_FILE, JSON.stringify(this.config, null, 2));
  }

  async request(path: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.config.apiUrl}${path}`;
    const headers = new Headers(options.headers);

    if (this.config.token) {
      headers.set("Authorization", `Bearer ${this.config.token}`);
    }

    headers.set("Content-Type", "application/json");

    const response = await fetch(url, {
      ...options,
      headers,
    });

    return response;
  }

  // Commands

  async login(): Promise<void> {
    console.log("Denploy Login\n");

    const email = prompt("Email:");
    const password = prompt("Password:");

    if (!email || !password) {
      console.error("Email and password are required");
      Deno.exit(1);
    }

    const response = await this.request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error(`Login failed: ${error.error}`);
      Deno.exit(1);
    }

    const data = await response.json();

    // Extract token from Set-Cookie header or response
    const setCookie = response.headers.get("set-cookie");
    let token = "";

    if (setCookie) {
      const match = setCookie.match(/auth_token=([^;]+)/);
      if (match) {
        token = match[1];
      }
    }

    this.config.token = token;
    this.config.email = email;

    await this.saveConfig();

    console.log(`✓ Logged in as ${email}`);
  }

  async logout(): Promise<void> {
    this.config.token = undefined;
    this.config.email = undefined;
    await this.saveConfig();
    console.log("✓ Logged out");
  }

  async listApps(): Promise<void> {
    if (!this.config.token) {
      console.error("Not logged in. Run: denploy login");
      Deno.exit(1);
    }

    const response = await this.request("/api/apps");

    if (!response.ok) {
      console.error("Failed to fetch apps");
      Deno.exit(1);
    }

    const { apps } = await response.json();

    if (apps.length === 0) {
      console.log("No apps found. Create one with: denploy apps create <name>");
      return;
    }

    console.log("\nYour Apps:\n");
    console.log("NAME".padEnd(20), "SUBDOMAIN".padEnd(25), "STATUS".padEnd(12), "PORT");
    console.log("-".repeat(70));

    for (const app of apps) {
      console.log(
        app.name.padEnd(20),
        app.subdomain.padEnd(25),
        app.status.padEnd(12),
        app.port
      );
    }

    console.log();
  }

  async createApp(name: string, subdomain?: string): Promise<void> {
    if (!this.config.token) {
      console.error("Not logged in. Run: denploy login");
      Deno.exit(1);
    }

    if (!name) {
      console.error("App name is required");
      Deno.exit(1);
    }

    const response = await this.request("/api/apps", {
      method: "POST",
      body: JSON.stringify({ name, subdomain: subdomain || name }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error(`Failed to create app: ${error.error}`);
      if (error.details) {
        error.details.forEach((d: string) => console.error(`  - ${d}`));
      }
      Deno.exit(1);
    }

    const { app } = await response.json();

    console.log(`✓ Created app: ${app.name}`);
    console.log(`  Subdomain: ${app.subdomain}`);
    console.log(`  Port: ${app.port}`);
    console.log(`\nDeploy with: denploy deploy ${app.name} ./path/to/app`);
  }

  async deleteApp(name: string): Promise<void> {
    if (!this.config.token) {
      console.error("Not logged in. Run: denploy login");
      Deno.exit(1);
    }

    // Find app by name
    const response = await this.request("/api/apps");
    const { apps } = await response.json();
    const app = apps.find((a: any) => a.name === name);

    if (!app) {
      console.error(`App not found: ${name}`);
      Deno.exit(1);
    }

    const confirm = prompt(`Delete app "${name}"? This cannot be undone. (yes/no):`);

    if (confirm !== "yes") {
      console.log("Cancelled");
      return;
    }

    const deleteResponse = await this.request(`/api/apps/${app.id}`, {
      method: "DELETE",
    });

    if (!deleteResponse.ok) {
      console.error("Failed to delete app");
      Deno.exit(1);
    }

    console.log(`✓ Deleted app: ${name}`);
  }

  async deploy(appName: string, path: string): Promise<void> {
    if (!this.config.token) {
      console.error("Not logged in. Run: denploy login");
      Deno.exit(1);
    }

    // Find app by name
    const response = await this.request("/api/apps");
    const { apps } = await response.json();
    const app = apps.find((a: any) => a.name === appName);

    if (!app) {
      console.error(`App not found: ${appName}`);
      Deno.exit(1);
    }

    console.log(`Deploying to ${appName}...`);

    // Check if path is a file or directory
    const stat = await Deno.stat(path);

    let fileData: Uint8Array;
    let fileName: string;

    if (stat.isFile) {
      // Single file
      fileName = path.split("/").pop() || "main.ts";
      fileData = await Deno.readFile(path);
      console.log(`Uploading file: ${fileName} (${fileData.length} bytes)`);
    } else if (stat.isDirectory) {
      // Create ZIP from directory
      console.log("Creating archive from directory...");

      // Use tar instead of zip for simplicity (available on most systems)
      const tempFile = await Deno.makeTempFile({ suffix: ".tar.gz" });

      const tarCommand = new Deno.Command("tar", {
        args: ["-czf", tempFile, "-C", path, "."],
        stdout: "piped",
        stderr: "piped",
      });

      const tarProcess = tarCommand.spawn();
      const tarResult = await tarProcess.status;

      if (!tarResult.success) {
        console.error("Failed to create archive");
        Deno.exit(1);
      }

      fileData = await Deno.readFile(tempFile);
      fileName = "app.tar.gz";

      console.log(`Created archive: ${fileName} (${fileData.length} bytes)`);

      // Clean up temp file
      await Deno.remove(tempFile);
    } else {
      console.error("Path must be a file or directory");
      Deno.exit(1);
    }

    // Upload
    const formData = new FormData();
    const blob = new Blob([fileData]);
    formData.append("file", blob, fileName);

    const deployResponse = await fetch(`${this.config.apiUrl}/api/apps/${app.id}/deploy`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.token}`,
      },
      body: formData,
    });

    if (!deployResponse.ok) {
      const error = await deployResponse.json();
      console.error(`Deployment failed: ${error.error}`);
      Deno.exit(1);
    }

    const { deployment } = await deployResponse.json();

    console.log(`✓ Deployed successfully`);
    console.log(`  Version: v${deployment.version}`);
    console.log(`  Status: ${deployment.status}`);
    console.log(`\nView logs with: denploy logs ${appName}`);
  }

  async logs(appName: string, follow = false): Promise<void> {
    if (!this.config.token) {
      console.error("Not logged in. Run: denploy login");
      Deno.exit(1);
    }

    // Find app by name
    const response = await this.request("/api/apps");
    const { apps } = await response.json();
    const app = apps.find((a: any) => a.name === appName);

    if (!app) {
      console.error(`App not found: ${appName}`);
      Deno.exit(1);
    }

    if (follow) {
      // TODO: Implement WebSocket log streaming
      console.log("Live log streaming not yet implemented");
      console.log("Showing recent logs:\n");
    }

    const logsResponse = await this.request(`/api/apps/${app.id}/logs?limit=50`);

    if (!logsResponse.ok) {
      console.error("Failed to fetch logs");
      Deno.exit(1);
    }

    const { logs } = await logsResponse.json();

    if (logs.length === 0) {
      console.log("No logs available");
      return;
    }

    for (const log of logs.reverse()) {
      const timestamp = new Date(log.timestamp).toISOString();
      const level = log.level.toUpperCase().padEnd(5);
      console.log(`${timestamp} [${level}] ${log.message}`);
    }
  }

  async appCommand(action: string, appName: string): Promise<void> {
    if (!this.config.token) {
      console.error("Not logged in. Run: denploy login");
      Deno.exit(1);
    }

    // Find app by name
    const response = await this.request("/api/apps");
    const { apps } = await response.json();
    const app = apps.find((a: any) => a.name === appName);

    if (!app) {
      console.error(`App not found: ${appName}`);
      Deno.exit(1);
    }

    console.log(`${action}ing app ${appName}...`);

    const actionResponse = await this.request(`/api/apps/${app.id}/${action}`, {
      method: "POST",
    });

    if (!actionResponse.ok) {
      const error = await actionResponse.json();
      console.error(`Failed to ${action} app: ${error.error}`);
      Deno.exit(1);
    }

    console.log(`✓ App ${action}ed successfully`);
  }

  async showHelp(): Promise<void> {
    console.log(`
Denploy CLI v${VERSION}

USAGE:
  denploy <command> [options]

COMMANDS:
  login                           Login to Denploy
  logout                          Logout from Denploy

  apps list                       List all your apps
  apps create <name> [subdomain]  Create a new app
  apps delete <name>              Delete an app

  deploy <app> <path>             Deploy app from file or directory

  start <app>                     Start an app
  stop <app>                      Stop an app
  restart <app>                   Restart an app

  logs <app> [-f]                 View app logs (-f to follow)

  config set api-url <url>        Set API URL
  config show                     Show current configuration

  version                         Show CLI version
  help                            Show this help

EXAMPLES:
  denploy login
  denploy apps create my-app
  denploy deploy my-app ./my-app-directory
  denploy logs my-app
  denploy restart my-app
`);
  }

  async configCommand(action: string, key?: string, value?: string): Promise<void> {
    if (action === "show") {
      console.log("\nCurrent Configuration:\n");
      console.log(`API URL: ${this.config.apiUrl}`);
      console.log(`Email:   ${this.config.email || "(not logged in)"}`);
      console.log(`Token:   ${this.config.token ? "***" + this.config.token.slice(-8) : "(none)"}`);
      console.log();
    } else if (action === "set" && key && value) {
      if (key === "api-url") {
        this.config.apiUrl = value;
        await this.saveConfig();
        console.log(`✓ API URL set to: ${value}`);
      } else {
        console.error(`Unknown config key: ${key}`);
        Deno.exit(1);
      }
    } else {
      console.error("Usage: denploy config show | set <key> <value>");
      Deno.exit(1);
    }
  }

  async run(args: string[]): Promise<void> {
    await this.loadConfig();

    const flags = parse(args);
    const [command, subcommand, ...rest] = flags._;

    try {
      switch (command) {
        case "login":
          await this.login();
          break;

        case "logout":
          await this.logout();
          break;

        case "apps":
          if (subcommand === "list") {
            await this.listApps();
          } else if (subcommand === "create") {
            await this.createApp(rest[0] as string, rest[1] as string);
          } else if (subcommand === "delete") {
            await this.deleteApp(rest[0] as string);
          } else {
            console.error("Usage: denploy apps list | create <name> | delete <name>");
            Deno.exit(1);
          }
          break;

        case "deploy":
          await this.deploy(subcommand as string, rest[0] as string);
          break;

        case "start":
        case "stop":
        case "restart":
          await this.appCommand(command, subcommand as string);
          break;

        case "logs":
          await this.logs(subcommand as string, flags.f || flags.follow);
          break;

        case "config":
          await this.configCommand(
            subcommand as string,
            rest[0] as string,
            rest[1] as string
          );
          break;

        case "version":
          console.log(`Denploy CLI v${VERSION}`);
          break;

        case "help":
        default:
          await this.showHelp();
          break;
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
      Deno.exit(1);
    }
  }
}

// Run CLI
if (import.meta.main) {
  const cli = new DenployCLI();
  await cli.run(Deno.args);
}
