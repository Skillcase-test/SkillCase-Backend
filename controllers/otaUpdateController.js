const pool = require("../util/db").pool;

const CURRENT_VERSION = "1.0.2";

const BUNDLE_URL = `${process.env.BACKEND_URL}/updates/bundle.zip`;

const checkIfNeedUpdate = async (req, res) => {
  const appVersion = req.query.version;
  const userId = req.user?.user_id;

  // Track user's current app version
  if (userId && appVersion) {
    try {
      await pool.query(
        `UPDATE app_user SET app_version = $1 WHERE user_id = $2`,
        [appVersion, userId]
      );
    } catch (err) {
      console.error("Failed to update app_version:", err.message);
    }
  }

  res.json({
    version: CURRENT_VERSION,
    url: appVersion !== CURRENT_VERSION ? BUNDLE_URL : null,
  });
};

const logOtaEvent = async (req, res) => {
  const { event, targetVersion, error } = req.body;
  const userId = req.user?.user_id;

  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    await pool.query(
      `INSERT INTO ota_update_log (user_id, event, target_version, error_message)
       VALUES ($1, $2, $3, $4)`,
      [userId, event, targetVersion || null, error || null]
    );

    console.log(`OTA Event: ${event} for user ${userId}`);

    res.json({ success: true });
  } catch (err) {
    console.error("Failed to log OTA event:", err.message);
    res.status(500).json({ message: "Failed to log event" });
  }
};

const getOtaStats = async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT 
        (SELECT COUNT(*) FROM app_user WHERE fcm_token IS NOT NULL) as total_app_users,
        (SELECT COUNT(*) FROM app_user WHERE app_version = $1) as on_latest_version,
        (SELECT COUNT(*) FROM ota_update_log WHERE event = 'download_started' AND created_at > NOW() - INTERVAL '7 days') as downloads_attempted,
        (SELECT COUNT(*) FROM ota_update_log WHERE event = 'download_complete' AND created_at > NOW() - INTERVAL '7 days') as downloads_succeeded,
        (SELECT COUNT(*) FROM ota_update_log WHERE event = 'download_failed' AND created_at > NOW() - INTERVAL '7 days') as downloads_failed
    `,
      [CURRENT_VERSION]
    );

    res.json({
      currentVersion: CURRENT_VERSION,
      ...result.rows[0],
    });
  } catch (err) {
    console.error("Failed to get OTA stats:", err.message);
    res.status(500).json({ message: "Failed to get stats" });
  }
};

module.exports = { checkIfNeedUpdate, logOtaEvent, getOtaStats };
