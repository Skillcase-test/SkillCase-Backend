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

const {
  authMiddleware,
  authorizeRole,
  optionalAuth,
} = require("./middlewares/auth_middleware");

const rateLimit = require("express-rate-limit");

const app = express();
const cors = require("cors");
const allowed_origins = [
  "https://skillcase-fronend-k4z5.vercel.app",
  "http://localhost:5173",
  "https://terms-and-conditions-skillcase.vercel.app",
  "https://skill-case-frontend.vercel.app",
];

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes
  message: "Too many requests, please try again later.",
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 login attempts per 15 minutes
  message: "Too many login attempts, please try again later.",
});

const ttsLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 TTS requests per minute per user
  message: "Too many TTS requests, please slow down.",
});

app.use(
  cors({
    origin: allowed_origins,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

const pool = db.pool;

db.initDb(pool);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.get("/", (req, res) => {
  res.send("FlashCard API with MySQL ready!");
});

app.use("/api/user/login", loginLimiter);
app.use("/api/", apiLimiter);

app.use("/api/admin", authMiddleware, authorizeRole("admin"), adminRouter);
app.use("/api/pronounce", authMiddleware, pronounceRouter);
app.use("/api/practice", optionalAuth, practiceRouter);
app.use("/api/user", userRouter);
app.use("/api/test", testRouter);
app.use("/api/interview", interviewRouter);
app.use("/api/agreement", agreementRouter);
app.use("/api/stories", authMiddleware, storyRouter);
app.use("/api/tts", authMiddleware, ttsLimiter, ttsRouter);

app.listen(3000, () => {
  console.log("server is running at http://localhost:3000");
});
