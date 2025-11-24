const express = require("express");
const userController = require("../controllers/userController");
const { authMiddleware } = require("../middlewares/auth_middleware");
const router = express.Router();

router.post("/login", userController.login);
router.post("/signup", userController.signup);
router.post("/me", authMiddleware, userController.me);

module.exports = router;
