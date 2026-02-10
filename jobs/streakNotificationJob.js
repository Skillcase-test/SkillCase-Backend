const cron = require("node-cron");
const admin = require("firebase-admin");
const { pool } = require("../util/db");

function getTodayIST() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  return istTime.toISOString().split("T")[0];
}

// Get all users with FCM tokens
async function getAllUserTokens() {
  const result = await pool.query(
    "SELECT fcm_token FROM app_user WHERE fcm_token IS NOT NULL",
  );
  return result.rows.map((row) => row.fcm_token);
}

// Get tokens of users who haven't met daily goal today
async function getUsersWithoutStreak() {
  const today = getTodayIST();
  const result = await pool.query(
    `
    SELECT u.fcm_token 
    FROM app_user u
    WHERE u.fcm_token IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM user_daily_activity uda 
      WHERE uda.user_id = u.user_id 
      AND uda.activity_date = $1 
      AND uda.daily_goal_met = true
    )
  `,
    [today],
  );
  return result.rows.map((row) => row.fcm_token);
}

//Log Notifications
async function logSentNotifications(tokens, notificationType, sentTimestamp) {
  try {
    const result = await pool.query(
      `SELECT user_id FROM app_user WHERE fcm_token = ANY($1)`,
      [tokens],
    );
    const userIds = result.rows.map((row) => row.user_id);

    if (userIds.length === 0) return;

    const values = userIds
      .map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`)
      .join(",");

    const params = userIds.flatMap((userId) => [
      userId,
      notificationType,
      sentTimestamp,
    ]);
    await pool.query(
      `INSERT INTO notification_analytics (user_id, notification_type, sent_at)
       VALUES ${values}`,
      params,
    );
  } catch (error) {
    console.error("Error logging sent notifications:", error);
  }
}

// Send push notification
async function sendNotification(
  tokens,
  title,
  body,
  notificationType,
  deepLink = "/continue",
) {
  if (tokens.length === 0) return;

  const sentTimestamp = new Date().toISOString();

  const message = {
    tokens,
    notification: { title, body },
    android: {
      priority: "high",
      notification: {
        channelId: "skillcase_default",
        sound: "skillcase_notification",
      },
    },
    data: {
      deepLink: deepLink,
      notificationType: notificationType,
      sentAt: sentTimestamp,
    },
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`Sent to ${response.successCount}/${tokens.length} devices`);

    // Log Sent Notifications with the SAME timestamp
    await logSentNotifications(tokens, notificationType, sentTimestamp);
  } catch (err) {
    console.error("Notification error:", err);
  }
}

// Schedule jobs
function initStreakNotificationJobs() {
  // 11 AM IST - Morning reminder to ALL users
  cron.schedule(
    "0 11 * * *",
    async () => {
      console.log("Running 11 AM notification job...");
      const tokens = await getAllUserTokens();
      await sendNotification(
        tokens,
        "✨ Consistency Wins",
        "Practice German today and stay on track.",
        "morning_reminder",
      );
    },
    { timezone: "Asia/Kolkata" },
  );
  // 8 PM IST - Evening reminder
  cron.schedule(
    "0 20 * * *",
    async () => {
      console.log("Running 8 PM notification job...");
      const tokens = await getUsersWithoutStreak();
      await sendNotification(
        tokens,
        "🔥 Streak at Risk",
        "Just 2 minutes of German keeps your progress intact.",
        "evening_reminder",
      );
    },
    { timezone: "Asia/Kolkata" },
  );
  console.log("Streak notification jobs scheduled");
}

module.exports = {
  initStreakNotificationJobs,
};
