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

// Wrapper to prevent transient AWS RDS/EC2 connection drops from crashing the cron job
async function executeWithRetry(queryText, params = [], retries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await pool.query(queryText, params);
    } catch (err) {
      lastError = err;
      console.warn(
        `[NewsNotification] DB query failed (attempt ${attempt}/${retries}): ${err.message}`
      );
      if (attempt < retries) {
        // Wait 2s, 4s before retrying
        await new Promise((res) => setTimeout(res, attempt * 2000));
      }
    }
  }
  throw lastError;
}

async function wasNewsIngestedToday() {
  // fetched_at is stored in UTC. 8 AM IST = 2:30 AM UTC, 9 AM IST = 3:30 AM UTC
  // Both are on the same UTC date, so this comparison is safe.
  const result = await executeWithRetry(
    `SELECT 1 FROM news_article WHERE fetched_at::date = CURRENT_DATE LIMIT 1`
  );
  return result.rowCount > 0;
}

async function getEligibleUserTokens() {
  const result = await executeWithRetry(
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
  try {
    // Guard: only notify if news was actually fetched today
    const ingestedToday = await wasNewsIngestedToday();
    if (!ingestedToday) {
      console.log("[NewsNotification] No news ingested today. Skipping notification.");
      return;
    }

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

    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(
      `[NewsNotification] Sent "${template.title}" to ${response.successCount}/${tokens.length} devices`
    );

    const userResult = await executeWithRetry(
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
      await executeWithRetry(
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
