const admin = require("firebase-admin");
const { pool } = require("../util/db");

let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
  const jsonString = Buffer.from(
    process.env.FIREBASE_SERVICE_ACCOUNT_BASE64,
    "base64"
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

const getAllUserTokens = async () => {
  const result = await pool.query(
    "SELECT fcm_token FROM app_user WHERE fcm_token IS NOT NULL"
  );
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
  const { title, body } = req.body;
  try {
    const tokens = await getAllUserTokens();

    if (tokens.length === 0) {
      return res.status(400).json({ error: "No users with FCM tokens" });
    }
    const message = {
      tokens: tokens,
      notification: { title, body },
      android: { priority: "high" },
    };
    const response = await admin.messaging().sendEachForMulticast(message);
    res.json({ success: true, sentTo: response.successCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to broadcast notification" });
  }
};

module.exports = { sendNotification, broadcastNotification };
