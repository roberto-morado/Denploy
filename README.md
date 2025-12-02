# Denploy

A self-hosted Platform-as-a-Service (PaaS) for deploying Deno applications.

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

## Quick Start

1. Clone the repository:
```bash
git clone <repository-url>
cd Denploy
```

2. Copy environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Run the platform:
```bash
deno task dev
```

4. Access the dashboard at `http://localhost:3000`

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
