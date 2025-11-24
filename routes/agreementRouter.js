const express = require("express");
const { submit } = require("../controllers/agreementController");

const router = express.Router();

router.post("/submit", submit);

module.exports = router;
