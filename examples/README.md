# Denploy Example Apps

This directory contains example applications that can be deployed to Denploy.

## Simple App

The `simple-app` directory contains a minimal Deno application that demonstrates:

- Basic HTTP server setup
- Environment variable usage (PORT, APP_NAME)
- Health check endpoint
- Simple HTML response

### Deploying the Simple App

1. Log in to Denploy dashboard
2. Create a new app
3. Upload `simple-app/main.ts` or zip the entire `simple-app` directory
4. Your app will be deployed and accessible at `yourapp.denploy.local`

## Creating Your Own App

Your Deno app must:

1. Have a `main.ts` file as the entry point
2. Start an HTTP server (using `Deno.serve` or similar)
3. Listen on the PORT environment variable
4. Optionally implement a `/health` endpoint for health checks

### Environment Variables

Your app automatically receives:

- `PORT` - The port your app should listen on
- `APP_NAME` - Your app's name
- `APP_ID` - Your app's unique ID
- Any custom environment variables you set in the dashboard

### Example with Custom Dependencies

```typescript
// main.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const port = parseInt(Deno.env.get("PORT") || "8000");

serve(
  (req) => {
    return new Response("Hello from Denploy!");
  },
  { port }
);
```

### Example with Deno KV

```typescript
// main.ts
const kv = await Deno.openKv();
const port = parseInt(Deno.env.get("PORT") || "8000");

Deno.serve({ port }, async (req) => {
  const url = new URL(req.url);

  if (url.pathname === "/count") {
    const count = await kv.get(["count"]);
    const newCount = (count.value as number || 0) + 1;
    await kv.set(["count"], newCount);

    return new Response(`Visit count: ${newCount}`);
  }

  return new Response("Hello!");
});
```

## Tips

1. **Keep it simple**: Start with a basic HTTP server
2. **Use health checks**: Implement `/health` endpoint
3. **Environment variables**: Use them for configuration
4. **Error handling**: Catch and log errors properly
5. **Graceful shutdown**: Handle SIGTERM for clean shutdowns
