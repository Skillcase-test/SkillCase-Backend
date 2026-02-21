const express = require("express");
const router = express.Router();
const { proxyDriveAudio } = require("../controllers/examAudioController");

router.get("/proxy", proxyDriveAudio);

module.exports = router;
