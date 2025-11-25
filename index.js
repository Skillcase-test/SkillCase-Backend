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


const app = express();
const cors = require("cors");
const allowed_origins = [
  "https://skillcase-fronend-k4z5.vercel.app",
  "http://localhost:5173",
  "https://terms-and-conditions-skillcase.vercel.app",
  "https://skill-case-frontend.vercel.app",
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

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.get("/", (req, res) => {
  res.send("FlashCard API with MySQL ready!");
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

app.listen(3000, () => {
  console.log("server is running at http://localhost:3000");
});
