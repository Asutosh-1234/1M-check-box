import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Server } from "socket.io";
import dotenv from "dotenv";
dotenv.config();

import { publisher, subscriber, redis } from "./redis-connection.js";
import { pool, initDB, findOrCreateUser, getUserById } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PgSession = connectPgSimple(session);

const CHECKBOX_KEY = "1M_check_box";
const CHECKBOX_COUNT = 1000;

async function getState() {
  const existingState = await redis.get(CHECKBOX_KEY);
  if (existingState) return JSON.parse(existingState);
  return new Array(CHECKBOX_COUNT).fill(false);
}

async function updateState(index, checked) {
  const state = await getState();
  state[index] = checked;
  await redis.set(CHECKBOX_KEY, JSON.stringify(state));
}


async function rateLimit(userId, socketId) {
  const key = `rateLimit:${userId ?? socketId}`;
  const now = Date.now();
  const windowMs = 5 * 1000;
  const max = 10;

  await redis.zremrangebyscore(key, 0, now - windowMs);
  const count = await redis.zcard(key);

  if (count >= max) return false;

  await redis.zadd(key, now, `${now}-${Math.random()}`);
  await redis.expire(key, Math.ceil(windowMs / 1000));
  return true;
}


passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "http://localhost:8000/auth/google/callback",
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const user = await findOrCreateUser(profile);
        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await getUserById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await initDB();

  const PORT = process.env.PORT ?? 8000;
  const app = express();
  const httpServer = http.createServer(app);
  const io = new Server(httpServer);

  // ── Session middleware ────────────────────────────────────────────────────
  const sessionMiddleware = session({
    store: new PgSession({ pool, tableName: "session" }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      httpOnly: true,
      sameSite: "lax",
    },
  });

  app.use(sessionMiddleware);
  app.use(passport.initialize());
  app.use(passport.session());

  // Share express session with Socket.IO
  io.engine.use(sessionMiddleware);
  io.engine.use(passport.initialize());
  io.engine.use(passport.session());

  // ── Auth routes ───────────────────────────────────────────────────────────
  app.get(
    "/auth/google",
    passport.authenticate("google", { scope: ["profile", "email"] })
  );

  app.get(
    "/auth/google/callback",
    passport.authenticate("google", { failureRedirect: "/?error=auth_failed" }),
    (req, res) => res.redirect("/")
  );

  app.get("/auth/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.redirect("/");
    });
  });

  app.get("/auth/me", (req, res) => {
    if (!req.user) return res.json({ user: null });
    res.json({
      user: {
        id: req.user.id,
        displayName: req.user.display_name,
        email: req.user.email,
        avatar: req.user.avatar,
      },
    });
  });

  // ── Checkbox state REST endpoint ──────────────────────────────────────────
  app.get("/state", async (req, res) => {
    const state = await getState();
    res.json({ state });
  });

  // ── Health check ──────────────────────────────────────────────────────────
  app.get("/health", (_req, res) => res.json({ ok: true }));

  // ── Redis Pub/Sub ─────────────────────────────────────────────────────────
  await subscriber.subscribe("internalServer:checkBox");
  subscriber.on("message", (channel, message) => {
    if (channel === "internalServer:checkBox") {
      const payload = JSON.parse(message);
      io.emit("user:checked", payload);
    }
  });

  // ── Socket.IO ─────────────────────────────────────────────────────────────
  io.on("connect", (socket) => {
    const req = socket.request;
    const user = req.user ?? null; // populated by passport via shared session
    const userId = user?.id ?? null;

    console.log("connected", { socketId: socket.id, userId });

    // Send auth state to this client
    socket.emit("auth:state", {
      authenticated: !!user,
      user: user
        ? {
            id: user.id,
            displayName: user.display_name,
            avatar: user.avatar,
          }
        : null,
    });

    socket.on("user:checked", async (data) => {
      // Anonymous users get read-only access
      if (!userId) {
        return socket.emit("error", {
          message: "Please sign in to interact with checkboxes.",
          code: "AUTH_REQUIRED",
        });
      }

      const { index, checked } = data;

      // Validate input
      if (
        typeof index !== "number" ||
        index < 0 ||
        index >= CHECKBOX_COUNT ||
        typeof checked !== "boolean"
      ) {
        return socket.emit("error", { message: "Invalid data", code: "BAD_INPUT" });
      }

      // Rate limit per user
      const allowed = await rateLimit(userId, socket.id);
      if (!allowed) {
        return socket.emit("error", {
          message: "Slow down! Too many changes.",
          code: "RATE_LIMITED",
        });
      }

      await updateState(index, checked);
      await publisher.publish(
        "internalServer:checkBox",
        JSON.stringify({ index, checked, userId })
      );
    });

    socket.on("disconnect", () => {
      console.log("disconnected", { socketId: socket.id, userId });
    });
  });

  app.use(express.static(path.resolve("./public")));

  httpServer.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});