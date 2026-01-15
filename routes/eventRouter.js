const express = require("express");
const router = express.Router();

const {
  getActiveEvents,
  getFeaturedEvent,
  getEventBySlug,
  registerForEvent,
  subscribeToEvents,
  unsubscribeFromEvents,
} = require("../controllers/eventController");

const { optionalAuth } = require("../middlewares/auth_middleware");

// Public/authenticated routes
router.get("/", optionalAuth, getActiveEvents);
router.get("/featured", optionalAuth, getFeaturedEvent);
router.get("/:slug", optionalAuth, getEventBySlug);
router.post("/:slug/register", optionalAuth, registerForEvent);
router.post("/subscribe", subscribeToEvents);
router.get("/unsubscribe/:token", unsubscribeFromEvents);

module.exports = router;
