import { Context, Next } from "@hono/hono";

export async function corsMiddleware(c: Context, next: Next) {
  // Set CORS headers
  c.res.headers.set("Access-Control-Allow-Origin", "*");
  c.res.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  c.res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Handle preflight requests
  if (c.req.method === "OPTIONS") {
    return c.text("", 204);
  }

  await next();
}
