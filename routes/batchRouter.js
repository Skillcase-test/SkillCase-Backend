const express = require("express");
const router = express.Router();
const batchController = require("../controllers/batchController");

// CRUD
router.post("/", batchController.createBatch);
router.get("/", batchController.listBatches);
router.put("/:batchId", batchController.updateBatch);
router.delete("/:batchId", batchController.deleteBatch);

// Student assignment
router.get("/:batchId/students", batchController.getBatchStudents);
router.post("/:batchId/students", batchController.assignStudents);
router.delete("/:batchId/students/:userId", batchController.removeStudent);

// List all students
router.get("/students/all", batchController.listAllStudents);

module.exports = router;
