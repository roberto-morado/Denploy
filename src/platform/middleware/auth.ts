import { Context, Next } from "@hono/hono";
import { getCookie } from "@hono/hono/cookie";
import { verifyToken } from "../../utils/security.ts";
import { getDB } from "../../db/kv.ts";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

declare module "@hono/hono" {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

export async function authMiddleware(c: Context, next: Next) {
  const token = getCookie(c, "auth_token");

  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const payload = await verifyToken(token);

  if (!payload || !payload.userId) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const db = await getDB();
  const user = await db.getUserById(payload.userId as string);

  if (!user || !user.isActive) {
    return c.json({ error: "User not found or inactive" }, 401);
  }

  c.set("user", {
    id: user.id,
    email: user.email,
    name: user.name,
  });

  await next();
}

export async function optionalAuthMiddleware(c: Context, next: Next) {
  const token = getCookie(c, "auth_token");

  if (token) {
    const payload = await verifyToken(token);

    if (payload && payload.userId) {
      const db = await getDB();
      const user = await db.getUserById(payload.userId as string);

      if (user && user.isActive) {
        c.set("user", {
          id: user.id,
          email: user.email,
          name: user.name,
        });
      }
    }
  }

  await next();
}
