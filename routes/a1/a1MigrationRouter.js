const express = require("express");

const a1Migration = require("../../controllers/a1/a1MigrationController");

const router = express.Router();

router.get("/status", a1Migration.getStatus);
router.post("/decision", a1Migration.saveDecision);
router.get("/entry-route", a1Migration.getEntryRoute);

module.exports = router;
