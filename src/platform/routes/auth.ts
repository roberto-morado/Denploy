import { Hono } from "@hono/hono";
import { setCookie, deleteCookie } from "@hono/hono/cookie";
import { v4 as uuidv4 } from "@std/uuid";
import { getDB } from "../../db/kv.ts";
import { hashPassword, verifyPassword, generateToken } from "../../utils/security.ts";
import { validateUserRegistration, validateLogin } from "../../utils/validation.ts";
import { logger } from "../../utils/logger.ts";
import type { User } from "../../db/models.ts";
import { authMiddleware } from "../middleware/auth.ts";

const auth = new Hono();

// Register new user
auth.post("/register", async (c) => {
  try {
    const body = await c.req.json();
    const { email, password, name } = body;

    // Validate input
    const validation = validateUserRegistration(email, password, name);
    if (!validation.valid) {
      return c.json({ error: "Validation failed", details: validation.errors }, 400);
    }

    const db = await getDB();

    // Check if user already exists
    const existingUser = await db.getUserByEmail(email);
    if (existingUser) {
      return c.json({ error: "User already exists" }, 409);
    }

    // Create user
    const passwordHash = await hashPassword(password);
    const user: User = {
      id: uuidv4.generate() as string,
      email,
      passwordHash,
      name,
      createdAt: new Date(),
      updatedAt: new Date(),
      sshPublicKeys: [],
      isActive: true,
    };

    await db.createUser(user);

    logger.info(`User registered: ${email}`);

    // Generate token
    const token = await generateToken({ userId: user.id });

    // Set cookie
    setCookie(c, "auth_token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      maxAge: 86400, // 24 hours
      path: "/",
    });

    return c.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    }, 201);
  } catch (error) {
    logger.error("Registration error", { error: error.message });
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Login
auth.post("/login", async (c) => {
  try {
    const body = await c.req.json();
    const { email, password } = body;

    // Validate input
    const validation = validateLogin(email, password);
    if (!validation.valid) {
      return c.json({ error: "Validation failed", details: validation.errors }, 400);
    }

    const db = await getDB();

    // Get user
    const user = await db.getUserByEmail(email);
    if (!user) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    // Verify password
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    if (!user.isActive) {
      return c.json({ error: "Account is inactive" }, 403);
    }

    logger.info(`User logged in: ${email}`);

    // Generate token
    const token = await generateToken({ userId: user.id });

    // Set cookie
    setCookie(c, "auth_token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      maxAge: 86400, // 24 hours
      path: "/",
    });

    return c.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    logger.error("Login error", { error: error.message });
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Logout
auth.post("/logout", async (c) => {
  deleteCookie(c, "auth_token", { path: "/" });
  return c.json({ success: true });
});

// Get current user
auth.get("/me", authMiddleware, async (c) => {
  const user = c.get("user");
  return c.json({ user });
});

export default auth;
