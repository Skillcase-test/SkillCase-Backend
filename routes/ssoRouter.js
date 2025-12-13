const express = require("express");
const ssoController = require("../controllers/ssoController");

const router = express.Router();

// Changed from GET to POST, receives user data
router.post("/create-token", ssoController.createToken);

module.exports = router;
