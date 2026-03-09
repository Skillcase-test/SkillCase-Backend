const { pool } = require("../util/db");

function getTodayIST() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  return istTime.toISOString().split("T")[0];
}

async function getDailyReport(req, res) {
  try {
    const today = getTodayIST();

    const [
      streakMaintainers,
      dauToday,
      newInstalls,
      sessionStats,
      eventRegistrations,
    ] = await Promise.all([
      // Who maintained streak today (daily_goal_met = true)
      pool.query(
        `SELECT
            u.fullname,
            u.username,
            us.current_streak
          FROM user_daily_activity uda
          JOIN app_user u ON uda.user_id = u.user_id
          JOIN user_streak us ON uda.user_id = us.user_id
          WHERE uda.activity_date = $1
            AND uda.daily_goal_met = true
            AND u.role = 'user'
          ORDER BY us.current_streak DESC`,
        [today],
      ),

      // DAU today — users with any activity recorded today
      pool.query(
        `SELECT
            u.fullname,
            u.username,
            u.last_activity_at
          FROM app_user u
          WHERE DATE(u.last_activity_at AT TIME ZONE 'Asia/Kolkata') = $1
            AND u.role = 'user'
          ORDER BY u.last_activity_at DESC`,
        [today],
      ),

      // New app installs today
      pool.query(
        `SELECT
            fullname,
            username,
            phone,
            signup_source,
            (created_at AT TIME ZONE 'Asia/Kolkata') AS created_at_ist
          FROM app_user
          WHERE DATE(created_at AT TIME ZONE 'Asia/Kolkata') = $1
            AND role = 'user'
          ORDER BY created_at ASC`,
        [today],
      ),

      // Session stats — active in last 24h and last 1h
      pool.query(
        `SELECT
            COUNT(*) FILTER (WHERE last_activity_at > NOW() - INTERVAL '24 hours') AS active_last_24h,
            COUNT(*) FILTER (WHERE last_activity_at > NOW() - INTERVAL '1 hour')   AS active_last_1h,
            COUNT(*)                                                                 AS total_users
          FROM app_user
          WHERE role = 'user'`,
      ),

      // Unique event registrations today
      pool.query(
        `SELECT
    er.name,
    er.email,
    er.phone,
    e.title AS event_title,
    (er.registered_at AT TIME ZONE 'Asia/Kolkata') AS registered_at_ist
  FROM event_registration er
  JOIN event e ON er.event_id = e.event_id
  WHERE DATE(er.registered_at AT TIME ZONE 'Asia/Kolkata') = $1
  ORDER BY er.registered_at ASC`,
        [today],
      ),
    ]);

    res.status(200).json({
      date: today,
      streakMaintainers: {
        count: streakMaintainers.rows.length,
        users: streakMaintainers.rows,
      },
      dauToday: {
        count: dauToday.rows.length,
        users: dauToday.rows.slice(0, 30),
      },
      newInstalls: {
        count: newInstalls.rows.length,
        users: newInstalls.rows,
      },
      sessionStats: sessionStats.rows[0],
      eventRegistrations: {
        count: eventRegistrations.rows.length,
        registrations: eventRegistrations.rows,
      },
    });
  } catch (error) {
    console.error("[DailyReport] Error:", error);
    res.status(500).json({ error: "Error fetching daily report" });
  }
}

module.exports = { getDailyReport };
