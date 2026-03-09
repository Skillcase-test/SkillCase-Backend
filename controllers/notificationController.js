const admin = require("firebase-admin");
const { pool } = require("../util/db");

let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
  const jsonString = Buffer.from(
    process.env.FIREBASE_SERVICE_ACCOUNT_BASE64,
    "base64",
  ).toString("utf-8");
  serviceAccount = JSON.parse(jsonString);
} else {
  serviceAccount = require("../serviceAccountKey.json");
}

const getUserById = async (userId) => {
  const result = await pool.query("SELECT * FROM app_user WHERE user_id = $1", [
    userId,
  ]);
  return result.rows[0];
};

const getAllUserTokens = async (
  targetLevel = "all",
  versionFilter = { type: "all" },
) => {
  let query = "SELECT fcm_token FROM app_user WHERE fcm_token IS NOT NULL";

  const params = [];

  // Filter by proficiency level
  if (targetLevel && targetLevel !== "all") {
    params.push(targetLevel.toUpperCase());
    query += ` AND UPPER(current_profeciency_level) = $${params.length}`;
  }

  // Filter by version
  if (versionFilter && versionFilter.type === "exact" && versionFilter.exact) {
    params.push(versionFilter.exact);
    query += ` AND app_version = $${params.length}`;
  } else if (versionFilter && versionFilter.type === "range") {
    if (versionFilter.minVersion) {
      params.push(versionFilter.minVersion);
      query += ` AND string_to_array(app_version, '.')::int[] >= string_to_array($${params.length}, '.')::int[]`;
    }
    if (versionFilter.maxVersion) {
      params.push(versionFilter.maxVersion);
      query += ` AND string_to_array(app_version, '.')::int[] <= string_to_array($${params.length}, '.')::int[]`;
    }
  }

  const result = await pool.query(query, params);

  return result.rows.map((row) => row.fcm_token);
};

// NEW FUNCTION — Returns all distinct app versions in the DB, sorted newest first
const getAvailableVersions = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT app_version
       FROM app_user
       WHERE app_version IS NOT NULL
       GROUP BY app_version
       ORDER BY string_to_array(app_version, '.')::int[] DESC`,
    );
    res.json({ versions: result.rows.map((r) => r.app_version) });
  } catch (err) {
    console.error("getAvailableVersions error:", err);
    res.status(500).json({ error: "Failed to fetch versions" });
  }
};

const sendNotification = async (req, res) => {
  const { userId, title, body, deepLink } = req.body;
  try {
    const user = await getUserById(userId);
    if (!user || !user.fcm_token) {
      return res.status(400).json({ error: "User has no FCM token" });
    }
    const message = {
      token: user.fcm_token,
      notification: { title, body },
      android: { priority: "high" },
      data: {
        deepLink: deepLink || "/continue",
      },
    };
    await admin.messaging().send(message);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to send notification" });
  }
};

const broadcastNotification = async (req, res) => {
  const {
    title,
    body,
    deepLink,
    imageUrl,
    externalLink,
    targetLevel,
    versionFilter,
  } = req.body;

  if (!title || !body) {
    return res.status(400).json({ error: "Title and body are required" });
  }

  try {
    // Pass targetLevel to filter users (defaults to "all" if not specified)
    const tokens = await getAllUserTokens(
      targetLevel || "all",
      versionFilter || { type: "all" },
    );

    if (tokens.length === 0) {
      const levelText =
        targetLevel && targetLevel !== "all"
          ? `${targetLevel.toUpperCase()} `
          : "";

      const versionText =
        versionFilter?.type === "exact"
          ? ` on v${versionFilter.exact}`
          : versionFilter?.type === "range"
            ? ` in version range`
            : "";

      return res
        .status(400)
        .json({ error: `No ${levelText}users${versionText} with FCM tokens` });
    }
    // Build notification payload
    const notification = { title, body };

    // Add image if provided (FCM native support)
    if (imageUrl) {
      notification.image = imageUrl;
    }

    // Determine which link to use (deepLink takes precedence over externalLink)
    const linkToUse = deepLink || externalLink || "/continue";

    const isExternalLink = externalLink && !deepLink;

    const message = {
      tokens: tokens,
      notification: notification,
      android: {
        priority: "high",
        notification: {
          channelId: "skillcase_default",
          sound: "skillcase_notification",
        },
      },
      data: {
        deepLink: linkToUse,
        isExternal: isExternalLink ? "true" : "false",
        notificationType: "broadcast",
        sentAt: new Date().toISOString(),
      },
    };

    const response = await admin.messaging().sendEachForMulticast(message);

    res.json({
      success: true,
      sentTo: response.successCount,
      failedCount: response.failureCount,
    });
  } catch (err) {
    console.error("Broadcast notification error:", err);
    res.status(500).json({ error: "Failed to broadcast notification" });
  }
};

module.exports = {
  sendNotification,
  broadcastNotification,
  getAvailableVersions,
};
