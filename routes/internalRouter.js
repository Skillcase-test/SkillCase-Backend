const express = require("express");
const { getDailyReport } = require("../controllers/internalReportController");

const router = express.Router();

function internalApiKeyMiddleware(req, res, next) {
  const apiKey = req.headers["x-internal-api-key"];
  if (!apiKey || apiKey !== process.env.INTERNAL_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

router.get("/daily-report", internalApiKeyMiddleware, getDailyReport);

module.exports = router;
