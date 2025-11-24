const express = require("express");
const { getTest } = require("../controllers/testController");
const router = express.Router();

router.get("/get/:prof_level", getTest);

module.exports = router;
