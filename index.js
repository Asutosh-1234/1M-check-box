import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
dotenv.config();

import express from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import passport from "passport";
import { Server } from "socket.io";


import { pool, initDB } from "./db.js";
import { configurePassport } from "./passportConfig.js";
import { setupRoutes } from "./routes.js";
import { setupSocket } from "./socketHandler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PgSession = connectPgSimple(session);

async function main() {
  await initDB();

  configurePassport();

  const PORT = process.env.PORT ?? 8000;
  const app = express();
  const httpServer = http.createServer(app);
  const io = new Server(httpServer);

  const sessionMiddleware = session({
    store: new PgSession({ pool, tableName: "session" }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: "lax",
    },
  });

  app.use(sessionMiddleware);
  app.use(passport.initialize());
  app.use(passport.session());

  io.engine.use(sessionMiddleware);
  io.engine.use(passport.initialize());
  io.engine.use(passport.session());

  setupRoutes(app);
  await setupSocket(io);

  app.use(express.static(path.resolve("./public")));

  httpServer.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});