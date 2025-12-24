const express = require("express");
const router = express.Router();

const { checkIfNeedUpdate } = require("../controllers/otaUpdateController");

router.get("/check", checkIfNeedUpdate);

module.exports = router;
