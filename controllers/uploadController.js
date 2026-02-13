const cloudinary = require("../config/cloudinary");
const { pool } = require("../util/db");

// Upload profile photo to Cloudinary
const uploadProfilePhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "skillcase/resume-photos",
      transformation: [
        { width: 400, height: 400, crop: "fill", gravity: "face" },
        { quality: "auto" },
      ],
    });
    res.json({
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Failed to upload image" });
  }
};

// Upload event cover image to Cloudinary
const uploadEventImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "skillcase/event-covers",
      transformation: [{ quality: "auto", fetch_format: "auto" }],
    });

    res.json({
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
    });
  } catch (error) {
    console.error("Event image upload error:", error);
    res.status(500).json({ error: "Failed to upload image" });
  }
};

const uploadNotificationImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Upload to Cloudinary with optimizations for notification display
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "skillcase/notification-images",
      transformation: [
        { width: 1024, height: 512, crop: "limit" }, // FCM recommended max
        { quality: "auto", fetch_format: "auto" },
      ],
    });

    res.json({
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
    });
  } catch (error) {
    console.error("Notification image upload error:", error);
    res.status(500).json({ error: "Failed to upload image" });
  }
};

// Upload user profile photo to Cloudinary and save URL
const uploadUserProfilePhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { user_id } = req.user;

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "skillcase/user-profiles",
      transformation: [
        { width: 400, height: 400, crop: "fill", gravity: "face" },
        { quality: "auto", fetch_format: "auto" },
      ],
    });

    // Save URL to database
    await pool.query(
      "UPDATE app_user SET profile_pic_url = $1, modified_at = CURRENT_TIMESTAMP WHERE user_id = $2",
      [result.secure_url, user_id],
    );

    res.json({
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
    });
  } catch (error) {
    console.error("Profile photo upload error:", error);
    res.status(500).json({ error: "Failed to upload profile photo" });
  }
};

module.exports = {
  uploadProfilePhoto,
  uploadEventImage,
  uploadNotificationImage,
  uploadUserProfilePhoto,
};
