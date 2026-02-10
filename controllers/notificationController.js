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

const getAllUserTokens = async (targetLevel = "all") => {
  let query = "SELECT fcm_token FROM app_user WHERE fcm_token IS NOT NULL";
  const params = [];
  
  // Filter by proficiency level if specified
  if (targetLevel && targetLevel !== "all") {
    query += " AND UPPER(current_profeciency_level) = $1";
    params.push(targetLevel.toUpperCase());
  }
  
  const result = await pool.query(query, params);
  return result.rows.map((row) => row.fcm_token);
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
  const { title, body, deepLink, imageUrl, externalLink, targetLevel } = req.body;

  if (!title || !body) {
    return res.status(400).json({ error: "Title and body are required" });
  }

  try {
    // Pass targetLevel to filter users (defaults to "all" if not specified)
    const tokens = await getAllUserTokens(targetLevel || "all");
    if (tokens.length === 0) {
      const levelText = targetLevel && targetLevel !== "all" ? `${targetLevel.toUpperCase()} ` : "";
      return res.status(400).json({ error: `No ${levelText}users with FCM tokens` });
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

module.exports = { sendNotification, broadcastNotification };
