const express = require("express");
const router = express.Router();
const pdfController = require("../controllers/pdfController");

router.post("/generate-resume", pdfController.generateResumePDF);

module.exports = router;
