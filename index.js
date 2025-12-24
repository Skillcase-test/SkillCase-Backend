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
const { initStreakNotificationJobs } = require("./jobs/streakNotificationJob");

const {
  authMiddleware,
  authorizeRole,
  optionalAuth,
} = require("./middlewares/auth_middleware");

const { initializeGemini } = require("./config/gemini");

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
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

const pool = db.pool;

db.initDb(pool);

initStreakNotificationJobs();

app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.get("/", (req, res) => {
  res.send("Skillcase Backend running!");
});

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
  conversationAdminRouter
);

app.use("/api/sso", ssoRouter);

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.use("/api/streak", authMiddleware, streakRouter);

app.use("/updates", express.static("public/updates")); // Serve bundles
app.use("/api/updates", updateRouter);

app.use(
  "/api/notifications",
  authMiddleware,
  authorizeRole("admin"),
  notificationRouter
);

app.listen(3000, () => {
  console.log("server is running at http://localhost:3000");
});
