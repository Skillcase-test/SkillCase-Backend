const express = require("express");
const {
  resolveInvite,
  submitSignedDocument,
} = require("../controllers/termsPublicController");

const router = express.Router();

router.get("/invite/:token", resolveInvite);
router.post("/invite/:token/submit", submitSignedDocument);

module.exports = router;
