import { layout } from "./layout.ts";
import type { App } from "../../db/models.ts";

export function homePage(): string {
  const content = `
    <div class="card" style="text-align: center; padding: 4rem 2rem;">
      <h1 style="font-size: 3rem; margin-bottom: 1rem;">Welcome to Denploy</h1>
      <p style="font-size: 1.25rem; color: #666; margin-bottom: 2rem;">
        A self-hosted Platform-as-a-Service for deploying Deno applications
      </p>
      <div style="display: flex; gap: 1rem; justify-content: center;">
        <a href="/register" class="btn">Get Started</a>
        <a href="/login" class="btn btn-secondary">Login</a>
      </div>
    </div>
    <div class="card">
      <h2 style="margin-bottom: 1rem;">Features</h2>
      <ul style="list-style-position: inside; line-height: 2;">
        <li>Deploy Deno apps via web upload (single files or ZIP)</li>
        <li>Automatic subdomain routing</li>
        <li>Real-time deployment logs via WebSocket</li>
        <li>App lifecycle management (start, stop, restart)</li>
        <li>Environment variables management</li>
        <li>Deployment versioning and rollback</li>
      </ul>
    </div>
  `;
  return layout("Home", content);
}

export function loginPage(error?: string): string {
  const content = `
    <div class="card" style="max-width: 500px; margin: 0 auto;">
      <h2 style="margin-bottom: 1.5rem;">Login</h2>
      ${error ? `<div class="error">${error}</div>` : ""}
      <form action="/auth/login" method="post">
        <div class="form-group">
          <label for="email">Email</label>
          <input type="email" id="email" name="email" required>
        </div>
        <div class="form-group">
          <label for="password">Password</label>
          <input type="password" id="password" name="password" required>
        </div>
        <button type="submit" class="btn" style="width: 100%;">Login</button>
      </form>
      <p style="margin-top: 1rem; text-align: center;">
        Don't have an account? <a href="/register">Register</a>
      </p>
    </div>
  `;
  return layout("Login", content);
}

export function registerPage(error?: string): string {
  const content = `
    <div class="card" style="max-width: 500px; margin: 0 auto;">
      <h2 style="margin-bottom: 1.5rem;">Register</h2>
      ${error ? `<div class="error">${error}</div>` : ""}
      <form action="/auth/register" method="post">
        <div class="form-group">
          <label for="name">Name</label>
          <input type="text" id="name" name="name" required>
        </div>
        <div class="form-group">
          <label for="email">Email</label>
          <input type="email" id="email" name="email" required>
        </div>
        <div class="form-group">
          <label for="password">Password</label>
          <input type="password" id="password" name="password" required>
          <small>Must be at least 8 characters with uppercase, lowercase, and number</small>
        </div>
        <button type="submit" class="btn" style="width: 100%;">Register</button>
      </form>
      <p style="margin-top: 1rem; text-align: center;">
        Already have an account? <a href="/login">Login</a>
      </p>
    </div>
  `;
  return layout("Register", content);
}

export function dashboardPage(user: { name: string; email: string }, apps: App[]): string {
  const content = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
      <h2>Your Apps</h2>
      <a href="/dashboard/apps/new" class="btn">Create New App</a>
    </div>
    ${apps.length === 0 ? `
      <div class="card" style="text-align: center; padding: 3rem;">
        <p style="font-size: 1.25rem; color: #666; margin-bottom: 1rem;">
          You don't have any apps yet
        </p>
        <a href="/dashboard/apps/new" class="btn">Create Your First App</a>
      </div>
    ` : `
      <div style="display: grid; gap: 1rem;">
        ${apps.map(app => `
          <div class="card">
            <div style="display: flex; justify-content: space-between; align-items: start;">
              <div>
                <h3 style="margin-bottom: 0.5rem;">${app.name}</h3>
                <p style="color: #666; margin-bottom: 0.5rem;">
                  <a href="http://${app.subdomain}.${app.subdomain}" target="_blank">
                    ${app.subdomain}.denploy.local
                  </a>
                </p>
                <p style="margin-bottom: 0.5rem;">
                  Status: <span style="color: ${
                    app.status === "running" ? "#28a745" :
                    app.status === "stopped" ? "#666" :
                    app.status === "error" ? "#dc3545" :
                    "#ffc107"
                  }; font-weight: bold;">${app.status.toUpperCase()}</span>
                </p>
                <p style="color: #666; font-size: 0.9rem;">
                  Port: ${app.port} | Created: ${new Date(app.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div style="display: flex; gap: 0.5rem;">
                <a href="/dashboard/apps/${app.id}" class="btn btn-secondary">Manage</a>
              </div>
            </div>
          </div>
        `).join("")}
      </div>
    `}
  `;
  return layout("Dashboard", content, user);
}

export function appDetailPage(
  user: { name: string; email: string },
  app: App,
  deployments: any[]
): string {
  const content = `
    <div style="margin-bottom: 2rem;">
      <a href="/dashboard" style="color: #666; text-decoration: none;">&larr; Back to Dashboard</a>
    </div>
    <div class="card">
      <h2 style="margin-bottom: 1rem;">${app.name}</h2>
      <p style="margin-bottom: 0.5rem;">
        URL: <a href="http://${app.subdomain}.denploy.local" target="_blank">
          ${app.subdomain}.denploy.local
        </a>
      </p>
      <p style="margin-bottom: 0.5rem;">
        Status: <span style="color: ${
          app.status === "running" ? "#28a745" :
          app.status === "stopped" ? "#666" :
          app.status === "error" ? "#dc3545" :
          "#ffc107"
        }; font-weight: bold;">${app.status.toUpperCase()}</span>
      </p>
      <p style="margin-bottom: 1rem;">Port: ${app.port}</p>

      <div style="display: flex; gap: 0.5rem; margin-bottom: 2rem;">
        <form action="/api/apps/${app.id}/start" method="post">
          <button type="submit" class="btn">Start</button>
        </form>
        <form action="/api/apps/${app.id}/stop" method="post">
          <button type="submit" class="btn btn-secondary">Stop</button>
        </form>
        <form action="/api/apps/${app.id}/restart" method="post">
          <button type="submit" class="btn btn-secondary">Restart</button>
        </form>
      </div>

      <h3 style="margin-bottom: 1rem;">Deploy New Version</h3>
      <form action="/api/apps/${app.id}/deploy" method="post" enctype="multipart/form-data">
        <div class="form-group">
          <label for="file">Upload File (main.ts or .zip)</label>
          <input type="file" id="file" name="file" accept=".ts,.tsx,.js,.jsx,.zip" required>
        </div>
        <button type="submit" class="btn">Deploy</button>
      </form>
    </div>

    <div class="card">
      <h3 style="margin-bottom: 1rem;">Deployments</h3>
      ${deployments.length === 0 ? `
        <p style="color: #666;">No deployments yet</p>
      ` : `
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="border-bottom: 2px solid #ddd;">
              <th style="text-align: left; padding: 0.5rem;">Version</th>
              <th style="text-align: left; padding: 0.5rem;">Status</th>
              <th style="text-align: left; padding: 0.5rem;">Deployed</th>
              <th style="text-align: left; padding: 0.5rem;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${deployments.map(dep => `
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 0.5rem;">v${dep.version}</td>
                <td style="padding: 0.5rem;">${dep.status}</td>
                <td style="padding: 0.5rem;">${new Date(dep.deployedAt).toLocaleString()}</td>
                <td style="padding: 0.5rem;">
                  ${dep.status === "inactive" ? `
                    <form action="/api/apps/${app.id}/deployments/${dep.id}/rollback" method="post" style="display: inline;">
                      <button type="submit" class="btn btn-secondary" style="padding: 0.25rem 0.75rem; font-size: 0.9rem;">Rollback</button>
                    </form>
                  ` : ""}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `}
    </div>
  `;
  return layout(`${app.name} - App Details`, content, user);
}

export function createAppPage(user: { name: string; email: string }, error?: string): string {
  const content = `
    <div style="margin-bottom: 2rem;">
      <a href="/dashboard" style="color: #666; text-decoration: none;">&larr; Back to Dashboard</a>
    </div>
    <div class="card" style="max-width: 600px; margin: 0 auto;">
      <h2 style="margin-bottom: 1.5rem;">Create New App</h2>
      ${error ? `<div class="error">${error}</div>` : ""}
      <form action="/api/apps" method="post">
        <div class="form-group">
          <label for="name">App Name</label>
          <input type="text" id="name" name="name" required>
          <small>Display name for your application</small>
        </div>
        <div class="form-group">
          <label for="subdomain">Subdomain</label>
          <input type="text" id="subdomain" name="subdomain" pattern="[a-z0-9-]+" required>
          <small>Your app will be available at subdomain.denploy.local</small>
        </div>
        <div style="display: flex; gap: 0.5rem;">
          <button type="submit" class="btn">Create App</button>
          <a href="/dashboard" class="btn btn-secondary">Cancel</a>
        </div>
      </form>
    </div>
  `;
  return layout("Create App", content, user);
}
