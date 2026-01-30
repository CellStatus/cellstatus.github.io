import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { pool } from "./db";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// CORS configuration for GitHub Pages frontend
const allowedOrigins = [
  "https://cellstatus.github.io",
  "http://localhost:5173", // Vite dev server
  "http://localhost:5000", // Local production test
];

// Respond to preflight OPTIONS for /api/* early with CORS headers
app.options("/api/*", (req, res) => {
  const origin = req.headers.origin as string | undefined;
  if (origin && allowedOrigins.some((allowed) => origin.startsWith(allowed))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type,Authorization,Cache-Control,Pragma,x-api-password",
    );
  }
  res.status(204).end();
});

// NOTE: API password middleware is registered later, after CORS/preflight handlers,
// so preflight OPTIONS requests are handled and do not get rejected by auth.

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);
      if (allowedOrigins.some(allowed => origin.startsWith(allowed))) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cache-Control", "Pragma"],
  })
);

// Explicitly ensure CORS headers are present for all /api requests and
// always respond to preflight OPTIONS before other middleware (rate limiter,
// etc.) can interfere. This is a defensive layer in addition to the `cors`
// middleware above to prevent missing Access-Control-Allow-Origin headers in
// some proxy/deployment environments.
app.use((req, res, next) => {
  const origin = req.headers.origin as string | undefined;
  if (origin && allowedOrigins.some((allowed) => origin.startsWith(allowed))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type,Authorization,Cache-Control,Pragma,x-api-password",
    );
  }

  if (req.method === "OPTIONS") {
    // Short-circuit preflight requests
    res.status(204).end();
    return;
  }

  next();
});

// Password protection middleware for all API routes
const API_PASSWORD = process.env.API_PASSWORD || "changeme"; // Set your password here or in .env
app.use("/api", (req, res, next) => {
  // Preflight requests are already handled above; allow OPTIONS through
  if (req.method === "OPTIONS") return next();

  const password = req.headers["x-api-password"] as string | undefined;
  if (!password || password !== API_PASSWORD) {
    return res.status(401).json({ message: "Unauthorized: Invalid or missing API password." });
  }
  next();
});

// Rate limiting to prevent abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/", limiter);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  // Get client IP (handles proxies)
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse).substring(0, 200)}`;
      }
      log(logLine);
    }
    
    // Log page visits (non-API requests) - useful for tracking users
    if (!path.startsWith("/api") && !path.includes(".") && req.method === "GET") {
      log(`PAGE VISIT: ${path} from ${clientIp} (${userAgent.substring(0, 50)})`, "access");
    }
  });

  next();
});

(async () => {
  async function ensureTables() {
    try {
      // Check if downtime_logs table exists; create if missing
      const check = await pool.query("SELECT to_regclass('public.downtime_logs') AS exists");
      const exists = check.rows?.[0]?.exists;
      if (!exists) {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS downtime_logs (
            id varchar PRIMARY KEY,
            machine_id varchar NOT NULL,
            reason_code text NOT NULL,
            reason_category text NOT NULL,
            description text,
            start_time text NOT NULL,
            end_time text,
            duration integer,
            reported_by text,
            resolved_by text,
            created_at text NOT NULL
          );
        `);
        log("created table downtime_logs", "db");
      }

      // Ensure events tables exist
      const checkEvents = await pool.query("SELECT to_regclass('public.events') AS exists");
      const eventsExists = checkEvents.rows?.[0]?.exists;
      if (!eventsExists) {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS events (
            id varchar PRIMARY KEY,
            title text NOT NULL,
            description text,
            start_date text,
            end_date text,
            created_at text NOT NULL,
            updated_at text NOT NULL,
            created_by varchar
          );
        `);
        log("created table events", "db");
      }

      const checkEventTasks = await pool.query("SELECT to_regclass('public.event_tasks') AS exists");
      const eventTasksExists = checkEventTasks.rows?.[0]?.exists;
      if (!eventTasksExists) {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS event_tasks (
            id varchar PRIMARY KEY,
            event_id varchar NOT NULL,
            title text NOT NULL,
            description text,
            start_date text,
            end_date text,
            status text,
            assignee_id varchar,
            created_at text NOT NULL,
            updated_at text NOT NULL
          );
        `);
        log("created table event_tasks", "db");
      }

      const checkEventMembers = await pool.query("SELECT to_regclass('public.event_members') AS exists");
      const eventMembersExists = checkEventMembers.rows?.[0]?.exists;
      if (!eventMembersExists) {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS event_members (
            id varchar PRIMARY KEY,
            event_id varchar NOT NULL,
            operator_id varchar NOT NULL,
            created_at text NOT NULL
          );
        `);
        log("created table event_members", "db");
      }
    } catch (err) {
      console.error("Failed to ensure tables:", err);
    }
  }

  try {
    await ensureTables();
    await registerRoutes(httpServer, app);
  } catch (err) {
    console.error("Failed to register routes:", err);
    throw err;
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    // Log the error once, but do not rethrow to avoid crashing the server in dev
    console.error(`[error] ${status} ${message}`);
    res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
  });
})();
