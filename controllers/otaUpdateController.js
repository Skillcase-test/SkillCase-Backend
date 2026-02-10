const pool = require("../util/db").pool;
const {
  isVersionEqual,
  isVersionLessThan,
  isVersionGreaterThan,
} = require("../util/versionUtils");

// VERSION CONFIGURATION
// IMPORTANT: When deploying a new OTA update:
// 1. Move CURRENT_VERSION value to PREVIOUS_VERSION
// 2. Set CURRENT_VERSION to the new version
// 3. Deploy the new bundle.zip to /public/updates/
const CURRENT_VERSION = "1.0.3";
const PREVIOUS_VERSION = "1.0.1"; // Only this version will receive OTA updates

const BUNDLE_URL = `${process.env.BACKEND_URL}/updates/bundle.zip`;
const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.skillcase.app";

// OTA Update Response Types
const UPDATE_STATUS = {
  UP_TO_DATE: "up_to_date", // User is on latest version
  OTA_AVAILABLE: "ota_available", // OTA update available (previous version only)
  PLAY_STORE_UPDATE: "play_store", // User too far behind, use Play Store
  NEWER_VERSION: "newer_version", // User is on a newer version (testing/dev)
};

// Check if user needs an update and determine update method
const checkIfNeedUpdate = async (req, res) => {
  const appVersion = req.query.version;
  const userId = req.user?.user_id;

  // Validate version parameter
  if (!appVersion) {
    return res.status(400).json({
      status: "error",
      message: "Version parameter is required",
    });
  }

  // Track user's current app version in database
  if (userId && appVersion) {
    try {
      await pool.query(
        `UPDATE app_user SET app_version = $1 WHERE user_id = $2`,
        [appVersion, userId],
      );
    } catch (err) {
      console.error("Failed to update app_version:", err.message);
      // Non-blocking error - continue with update check
    }
  }

  // Determine update status based on version comparison
  let status,
    url = null,
    playStoreUrl = null,
    message = null;

  if (isVersionEqual(appVersion, CURRENT_VERSION)) {
    // User is on the latest version - no update needed
    status = UPDATE_STATUS.UP_TO_DATE;
    message = "You are on the latest version";
  } else if (isVersionGreaterThan(appVersion, CURRENT_VERSION)) {
    // User is on a NEWER version (development/testing build)
    // Do NOT try to downgrade them
    status = UPDATE_STATUS.NEWER_VERSION;
    message = "Development version detected";
  } else if (isVersionEqual(appVersion, PREVIOUS_VERSION)) {
    // User is on the immediately previous version - eligible for OTA
    status = UPDATE_STATUS.OTA_AVAILABLE;
    url = BUNDLE_URL;
    message = "OTA update available";
  } else {
    // User is on an older version - redirect to Play Store
    status = UPDATE_STATUS.PLAY_STORE_UPDATE;
    playStoreUrl = PLAY_STORE_URL;
    message = "Please update from the Play Store for the best experience";
  }

  console.log(
    `OTA Check: user=${userId || "anonymous"}, appVersion=${appVersion}, status=${status}`,
  );

  res.json({
    status,
    currentVersion: CURRENT_VERSION,
    userVersion: appVersion,
    url, // OTA bundle URL (only for OTA_AVAILABLE)
    playStoreUrl, // Play Store URL (only for PLAY_STORE_UPDATE)
    message,
    version: CURRENT_VERSION, // Kept for backward compatibility
  });
};

// Log OTA update events for analytics
const logOtaEvent = async (req, res) => {
  const { event, targetVersion, error, appVersion } = req.body;
  const userId = req.user?.user_id;

  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  // Valid event types
  const validEvents = [
    "check_started",
    "download_started",
    "download_complete",
    "download_failed",
    "bundle_applied",
    "play_store_redirect",
    "retry_attempt",
  ];

  if (!validEvents.includes(event)) {
    return res.status(400).json({ message: "Invalid event type" });
  }

  try {
    await pool.query(
      `INSERT INTO ota_update_log (user_id, event, target_version, error_message)
       VALUES ($1, $2, $3, $4)`,
      [userId, event, targetVersion || null, error || null],
    );

    console.log(
      `OTA Event: ${event} for user ${userId}, target: ${targetVersion || "N/A"}`,
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Failed to log OTA event:", err.message);
    res.status(500).json({ message: "Failed to log event" });
  }
};

// Get OTA update statistics (admin only)
const getOtaStats = async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT 
        (SELECT COUNT(*) FROM app_user WHERE fcm_token IS NOT NULL) as total_app_users,
        (SELECT COUNT(*) FROM app_user WHERE app_version = $1) as on_latest_version,
        (SELECT COUNT(*) FROM app_user WHERE app_version = $2) as on_previous_version,
        (SELECT COUNT(*) FROM app_user WHERE app_version IS NOT NULL AND app_version != $1 AND app_version != $2) as on_older_versions,
        (SELECT COUNT(*) FROM ota_update_log WHERE event = 'download_started' AND created_at > NOW() - INTERVAL '7 days') as downloads_attempted,
        (SELECT COUNT(*) FROM ota_update_log WHERE event = 'download_complete' AND created_at > NOW() - INTERVAL '7 days') as downloads_succeeded,
        (SELECT COUNT(*) FROM ota_update_log WHERE event = 'download_failed' AND created_at > NOW() - INTERVAL '7 days') as downloads_failed,
        (SELECT COUNT(*) FROM ota_update_log WHERE event = 'play_store_redirect' AND created_at > NOW() - INTERVAL '7 days') as play_store_redirects,
        (SELECT COUNT(*) FROM ota_update_log WHERE event = 'retry_attempt' AND created_at > NOW() - INTERVAL '7 days') as retry_attempts
    `,
      [CURRENT_VERSION, PREVIOUS_VERSION],
    );

    res.json({
      currentVersion: CURRENT_VERSION,
      previousVersion: PREVIOUS_VERSION,
      ...result.rows[0],
    });
  } catch (err) {
    console.error("Failed to get OTA stats:", err.message);
    res.status(500).json({ message: "Failed to get stats" });
  }
};

module.exports = { checkIfNeedUpdate, logOtaEvent, getOtaStats };
