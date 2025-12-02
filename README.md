# Denploy

A self-hosted Platform-as-a-Service (PaaS) for deploying Deno applications.

## ⚠️ Important: Deployment Requirements

**Denploy MUST run on your own infrastructure. It CANNOT run on:**
- ❌ Deno Deploy (serverless)
- ❌ Vercel, Netlify (serverless)
- ❌ Cloudflare Workers (edge runtime)

**Denploy MUST run on:**
- ✅ Your own VPS/Server (DigitalOcean, Linode, AWS EC2, Hetzner, etc.)
- ✅ Local development machine
- ✅ On-premises server
- ✅ Any machine where you have root/sudo access

**Why?** Denploy spawns child processes, manages Nginx configs, and stores files on disk - features not available in serverless environments.

## Features

- 🚀 Deploy Deno apps via web upload (single files or ZIP)
- 🌐 Automatic subdomain routing (myapp.denploy.local)
- 🔐 User authentication and management
- 📊 Real-time deployment logs via WebSocket
- 🔄 App lifecycle management (start, stop, restart)
- 🔧 SSH access for app configuration
- 📦 Environment variables management
- ⚡ Built with Deno, Hono, and Deno KV

## Tech Stack

- **Runtime**: Deno 2.x
- **Framework**: Hono
- **Database**: Deno KV
- **Reverse Proxy**: Nginx
- **Real-time**: WebSockets
- **Scheduling**: Deno Cron

## Quick Start (Local Testing)

1. **Prerequisites:**
   - Deno 2.x installed
   - Linux, macOS, or WSL2 (Windows)

2. Clone the repository:
```bash
git clone <repository-url>
cd Denploy
```

3. Run the platform (no .env needed for local testing):
```bash
deno task dev
```

4. Access the dashboard at `http://localhost:3000`

5. Register an account and deploy your first app!

**Note:** For local testing, .env is optional - defaults work out of the box. For production deployment, see `DEPLOYMENT.md`.

## Development

- `deno task dev` - Start development server with watch mode
- `deno task start` - Start production server
- `deno task test` - Run tests
- `deno task check` - Type check

## Architecture

```
User Browser → Nginx → Platform (Hono) → Deno KV
                 ↓
              User Apps (Deno processes)
```

## License

MIT
