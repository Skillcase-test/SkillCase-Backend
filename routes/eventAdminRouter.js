const express = require("express");
const multer = require("multer");

const router = express.Router();

const {
  createEvent,
  updateEvent,
  deleteEvent,
  getAllEvents,
  getEventRegistrations,
  permanentDeleteEvent,
  restoreEvent,
  createInstanceOverride,
} = require("../controllers/eventController");

const { uploadEventImage } = require("../controllers/uploadController");

// Access code verification middleware
const verifyAccessCode = (req, res, next) => {
  const accessCode = req.headers["x-access-code"];
  const VALID_CODE = process.env.EVENT_ADMIN_ACCESS_CODE;

  if (!VALID_CODE) {
    console.error(
      "[EventAdmin] EVENT_ADMIN_ACCESS_CODE not set in environment"
    );
    return res.status(500).json({ msg: "Server configuration error" });
  }

  if (accessCode === VALID_CODE) {
    next();
  } else {
    res.status(401).json({ msg: "Invalid access code" });
  }
};

// Apply access code verification to all routes
router.use(verifyAccessCode);

// Configure multer for event image uploads
const upload = multer({
  dest: "tmp/uploads/",
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

// Admin routes
router.post("/", createEvent);
router.put("/:event_id", updateEvent);
router.delete("/:event_id", deleteEvent);
router.get("/", getAllEvents);
router.get("/:event_id/registrations", getEventRegistrations);
router.put("/:event_id/restore", restoreEvent);
router.delete("/:event_id/permanent", permanentDeleteEvent);

// Instance override route
router.post("/:event_id/override", createInstanceOverride);

// Image upload route
router.post("/upload-image", upload.single("image"), uploadEventImage);

module.exports = router;
