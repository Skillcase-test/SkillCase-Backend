const express = require("express");
const { synthesizeSpeech } = require("../controllers/ttsController");

const router = express.Router();

router.post("/speak", synthesizeSpeech);

module.exports = router;
