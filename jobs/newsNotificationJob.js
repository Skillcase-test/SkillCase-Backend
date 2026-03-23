const cron = require("node-cron");
const admin = require("firebase-admin");
const { pool } = require("../util/db");

const NEWS_MIN_VERSION = "1.1.2";

// 7 templates — indexed by day of week (0=Sun, 1=Mon, ..., 6=Sat)
const NOTIFICATION_TEMPLATES = [
  {
    title: "Sunday Reading Sorted",
    body: "Wind down with today's top news in German and English.",
  },
  {
    title: "Start the Week Informed",
    body: "Fresh news is in. Check out today's top stories.",
  },
  {
    title: "Your Tuesday News Digest",
    body: "Stay sharp — today's headlines are ready for you.",
  },
  {
    title: "Mid-Week News Update",
    body: "Catch up on what's happening around the world today.",
  },
  {
    title: "Thursday News Briefing",
    body: "New stories added. See what made today's headlines.",
  },
  {
    title: "Friday News Roundup",
    body: "Wrap up the week with the latest stories in German and English.",
  },
  {
    title: "Weekend News is Here",
    body: "Relax and read. Today's news is ready for you.",
  },
];

function getDailyTemplate() {
  // Use IST day-of-week for consistency with the cron timezone
  const nowIST = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
  );
  const dayIndex = nowIST.getDay(); // 0–6
  return NOTIFICATION_TEMPLATES[dayIndex];
}

async function getEligibleUserTokens() {
  const result = await pool.query(
    `
    SELECT fcm_token
    FROM app_user
    WHERE fcm_token IS NOT NULL
      AND app_version IS NOT NULL
      AND string_to_array(app_version, '.')::int[]
          >= string_to_array($1, '.')::int[]
    `,
    [NEWS_MIN_VERSION],
  );
  return result.rows.map((row) => row.fcm_token);
}

async function sendNewsNotification() {
  const tokens = await getEligibleUserTokens();

  if (tokens.length === 0) {
    console.log("[NewsNotification] No eligible users found. Skipping.");
    return;
  }

  const template = getDailyTemplate();
  const sentTimestamp = new Date().toISOString();

  const message = {
    tokens,
    notification: {
      title: template.title,
      body: template.body,
    },
    android: {
      priority: "high",
      notification: {
        channelId: "skillcase_default",
        sound: "skillcase_notification",
      },
    },
    data: {
      deepLink: "/news",
      notificationType: "daily_news",
      sentAt: sentTimestamp,
    },
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(
      `[NewsNotification] Sent "${template.title}" to ${response.successCount}/${tokens.length} devices`,
    );

    const userResult = await pool.query(
      `SELECT user_id FROM app_user WHERE fcm_token = ANY($1)`,
      [tokens],
    );
    const userIds = userResult.rows.map((r) => r.user_id);

    if (userIds.length > 0) {
      const values = userIds
        .map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`)
        .join(",");
      const params = userIds.flatMap((userId) => [
        userId,
        "daily_news",
        sentTimestamp,
      ]);
      await pool.query(
        `INSERT INTO notification_analytics (user_id, notification_type, sent_at) VALUES ${values}`,
        params,
      );
    }
  } catch (err) {
    console.error("[NewsNotification] Error sending notification:", err);
  }
}

function initNewsNotificationJob() {
  cron.schedule(
    "0 9 * * *",
    async () => {
      console.log(
        "[NewsNotification] Running daily news notification at 9 AM IST",
      );
      await sendNewsNotification();
    },
    { timezone: "Asia/Kolkata" },
  );

  console.log("[NewsNotification] Daily job scheduled at 9 AM IST");
}

module.exports = { initNewsNotificationJob };
