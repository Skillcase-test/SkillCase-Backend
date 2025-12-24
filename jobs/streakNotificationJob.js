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
    "SELECT fcm_token FROM app_user WHERE fcm_token IS NOT NULL"
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
    [today]
  );
  return result.rows.map((row) => row.fcm_token);
}

// Send push notification
async function sendNotification(tokens, title, body) {
  if (tokens.length === 0) return;

  const message = {
    tokens,
    notification: { title, body },
    android: { priority: "high" },
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`Sent to ${response.successCount}/${tokens.length} devices`);
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
        "🎯 Start Your Day Strong!",
        "Practice German today to keep your streak alive!"
      );
    },
    { timezone: "Asia/Kolkata" }
  );

  // 8 PM IST - Evening reminder to users WITHOUT streak
  cron.schedule(
    "0 20 * * *",
    async () => {
      console.log("Running 8 PM notification job...");
      const tokens = await getUsersWithoutStreak();
      await sendNotification(
        tokens,
        "⏰ Dont Break Your Streak!",
        "You havent practiced today. Just 5 minutes to keep your streak!"
      );
    },
    { timezone: "Asia/Kolkata" }
  );

  // 6 PM IST - TEST notification
  cron.schedule(
    "0 18 * * *",
    async () => {
      console.log("Running 6 PM TEST notification job...");
      const tokens = await getAllUserTokens();
      await sendNotification(
        tokens,
        "✅ Scheduled Notifications Work!",
        "This is a test notification. You can remove this after confirming."
      );
    },
    { timezone: "Asia/Kolkata" }
  );

  console.log("Streak notification jobs scheduled");
}

module.exports = {
  initStreakNotificationJobs,
};
