process.env.TZ = "UTC";
require("dotenv").config();
require("./services/firebaseService");
const db = require("./util/db");
const express = require("express");
const adminRouter = require("./routes/adminRouter");
const practiceRouter = require("./routes/practiceRoute");
const userRouter = require("./routes/userRouter");
const interviewRouter = require("./routes/interviewRouter");
const testRouter = require("./routes/testRouter");
const pronounceRouter = require("./routes/pronounceRoute");
const agreementRouter = require("./routes/agreementRouter");
const storyRouter = require("./routes/storyRouter");
const ttsRouter = require("./routes/ttsRouter");
// const resumeRouter = require("./routes/resumeRouter");
// const pdfRoutes = require("./routes/pdfRouter");
const uploadRouter = require("./routes/uploadRouter");

const conversationRouter = require("./routes/conversationRouter");
const conversationAdminRouter = require("./routes/conversationAdminRouter");

const streakRouter = require("./routes/streakRouter");

const cookieParser = require("cookie-parser");
const ssoRouter = require("./routes/ssoRouter");

const updateRouter = require("./routes/otaUpdateRouter");
const notificationRouter = require("./routes/notificationRouter");
const leadRouter = require("./routes/leadRouter");

const authRouter = require("./routes/authRouter");

const eventRouter = require("./routes/eventRouter");
const eventAdminRouter = require("./routes/eventAdminRouter");

const a2Router = require("./routes/a2/a2Router");
const a2AdminRouter = require("./routes/a2/a2AdminRouter");

// Hardcore Test Module
const examRouter = require("./routes/examRouter");
const examAdminRouter = require("./routes/examAdminRouter");
const batchRouter = require("./routes/batchRouter");
const examAudioRouter = require("./routes/examAudioRouter");

// Dynamic Landing Page components
const landingPageRouter = require("./routes/landingPageRouter");

// News Module
const newsRouter = require("./routes/newsRouter");

// Sync
const syncRouter = require("./routes/syncRouter");

// Interview
const interviewToolAdminRouter = require("./routes/interviewToolAdminRouter");
const interviewToolPublicRouter = require("./routes/interviewToolPublicRouter");

// Wise
const wiseRouter = require("./routes/wiseRouter");

// A1 revamp
const a1Router = require("./routes/a1/a1Router");
const a1AdminRouter = require("./routes/a1/a1AdminRouter");
const a1MigrationRouter = require("./routes/a1/a1MigrationRouter");

const { initStreakNotificationJobs } = require("./jobs/streakNotificationJob");
const { initMessageSchedulerJob } = require("./jobs/messageSchedulerJob");
const { startOtpCleanupJob } = require("./jobs/cleanupOtp");
const { initEventReminderJob } = require("./jobs/eventReminderJob");
const { initStreakResetJob } = require("./jobs/streakResetJob");
const { initNewsIngestJob } = require("./jobs/newsIngestJob");
const { initNewsNotificationJob } = require("./jobs/newsNotificationJob");

const internalRouter = require("./routes/internalRouter");

const {
  authMiddleware,
  authorizeRole,
  optionalAuth,
} = require("./middlewares/auth_middleware");

const { initializeGemini } = require("./config/gemini");
const { RUN_SCHEDULED_JOBS } = require("./config/configuration");
const { sendErrorToDiscord } = require("./util/discordNotifier");

const DB_INIT_STRICT =
  String(process.env.DB_INIT_STRICT || "false").toLowerCase() === "true";

// Process-level error catchers for things outside the Express request lifecycle
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  sendErrorToDiscord(
    reason instanceof Error ? reason : new Error(String(reason)),
    { type: "unhandledRejection" },
  );
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  sendErrorToDiscord(error, { type: "uncaughtException" });
});

const app = express();
const cors = require("cors");
const allowed_origins = [
  "https://skillcase-fronend-k4z5.vercel.app",
  "http://localhost:5173",
  "https://terms-and-conditions-skillcase.vercel.app",
  "https://skill-case-frontend.vercel.app",
  "https://learner.skillcase.in",
  "https://skillcase-terms-and-condition.vercel.app",
  "https://terms.skillcase.in",
  "https://skillcase.in",

  //for the app
  "capacitor://localhost",
  "https://localhost",
  "http://localhost",
];

app.use(
  cors({
    origin: allowed_origins,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-access-code",
      "x-internal-api-key",
      "x-wise-access-code",
    ],
    credentials: true,
  }),
);

const pool = db.pool;

function startScheduledJobs() {
  if (!RUN_SCHEDULED_JOBS) {
    console.warn(
      "[Jobs] RUN_SCHEDULED_JOBS is false. Skipping cron initialization.",
    );
    return;
  }

  initStreakNotificationJobs();
  // initMessageSchedulerJob();
  startOtpCleanupJob();
  initEventReminderJob();
  initStreakResetJob();
  initNewsIngestJob();
  initNewsNotificationJob();
}

app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.get("/", (req, res) => {
  res.send("Skillcase Backend running!");
});

app.use("/api/auth", authRouter);
app.use("/api/admin/events", eventAdminRouter);
app.use("/api/admin", authMiddleware, authorizeRole("admin"), adminRouter);
app.use("/api/pronounce", authMiddleware, pronounceRouter);
app.use("/api/practice", optionalAuth, practiceRouter);
app.use("/api/user", userRouter);
app.use("/api/test", testRouter);
app.use("/api/interview", interviewRouter);
app.use("/api/agreement", agreementRouter);
app.use("/api/stories", authMiddleware, storyRouter);
app.use("/api/tts", authMiddleware, ttsRouter);
// app.use("/api/resume", authMiddleware, resumeRouter);
// app.use("/api/pdf", pdfRoutes);
app.use("/api/upload", uploadRouter);

app.use("/api/conversation", authMiddleware, conversationRouter);
app.use(
  "/api/admin/conversation",
  authMiddleware,
  authorizeRole("admin"),
  conversationAdminRouter,
);

app.use("/api/a2", authMiddleware, a2Router);
app.use("/api/admin/a2", authMiddleware, authorizeRole("admin"), a2AdminRouter);

// A1 revamp
app.use("/api/a1", authMiddleware, a1Router);
app.use("/api/admin/a1", authMiddleware, authorizeRole("admin"), a1AdminRouter);
app.use("/api/a1-migration", authMiddleware, a1MigrationRouter);

// Hardcore Test Module
app.use("/api/exam-audio", examAudioRouter);
app.use("/api/exam", authMiddleware, examRouter);
app.use(
  "/api/admin/exam",
  authMiddleware,
  authorizeRole("admin"),
  examAdminRouter,
);
app.use(
  "/api/admin/batch",
  authMiddleware,
  authorizeRole("admin"),
  batchRouter,
);

app.use("/api/sso", ssoRouter);

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      db: "connected",
    });
  } catch (error) {
    console.error("[Health] DB probe failed:", error.message);
    res.status(503).json({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      db: "disconnected",
    });
  }
});

app.use("/api/streak", authMiddleware, streakRouter);

app.use("/updates", express.static("public/updates")); // Serve bundles
app.use("/api/updates", updateRouter);
app.use("/api/api/updates", updateRouter);

app.use(
  "/api/notifications",
  authMiddleware,
  authorizeRole("admin"),
  notificationRouter,
);

app.use("/api/events", eventRouter);
app.use("/api/leads", leadRouter);

// Dynamic Landing page
// Public
app.use("/api/landing-page", landingPageRouter);

// Admin
app.use("/api/admin/landing-page", landingPageRouter);

// News Module
app.use("/api/news", authMiddleware, newsRouter);

app.use("/api/internal", internalRouter);

// Sync
app.use("/api/sync", syncRouter);

// Interview
app.use(
  "/api/admin/interview-tools",
  authMiddleware,
  authorizeRole("admin"),
  interviewToolAdminRouter,
);

app.use("/api/interview-tools", interviewToolPublicRouter);

// Wise
app.use("/api/wise", wiseRouter);

// Global Error Handler Middleware
app.use((err, req, res, next) => {
  console.error("Express Error Middleware Caught:", err);

  // Fire and forget to Discord
  sendErrorToDiscord(err, {
    method: req.method,
    url: req.originalUrl || req.url,
    body: req.body,
    user: req.user ? req.user.user_id : "unauth/unknown",
  });

  res.status(err.status || 500).json({ error: "Internal Server Error" });
});

let isShuttingDown = false;

async function gracefulShutdown(server, signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`[Shutdown] Received ${signal}. Draining connections...`);

  server.close(async (closeError) => {
    if (closeError) {
      console.error("[Shutdown] HTTP server close error:", closeError);
    }

    try {
      await pool.end();
      console.log("[Shutdown] DB pool closed");
      process.exit(closeError ? 1 : 0);
    } catch (poolError) {
      console.error("[Shutdown] DB pool close failed:", poolError);
      process.exit(1);
    }
  });

  setTimeout(() => {
    console.error("[Shutdown] Force exit after timeout");
    process.exit(1);
  }, 15000).unref();
}

async function startServer() {
  try {
    try {
      await db.initDb(pool);
    } catch (initError) {
      const message = String(initError?.message || "").toLowerCase();
      const isConnectivityError =
        message.includes("connection") ||
        message.includes("timeout") ||
        message.includes("econn") ||
        message.includes("no pg_hba") ||
        message.includes("could not connect") ||
        message.includes("server closed");

      if (DB_INIT_STRICT || isConnectivityError) {
        throw initError;
      }

      console.warn(
        "[Startup] DB init had non-fatal schema error. Continuing because DB_INIT_STRICT=false:",
        initError.message,
      );
    }

    startScheduledJobs();

    const server = app.listen(3000, () => {
      console.log("server is running at http://localhost:3000");
    });

    process.on("SIGTERM", () => gracefulShutdown(server, "SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown(server, "SIGINT"));
  } catch (error) {
    console.error("[Startup] Failed to initialize backend:", error);
    process.exit(1);
  }
}

startServer();
