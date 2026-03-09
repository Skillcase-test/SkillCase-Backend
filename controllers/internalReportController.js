const { pool } = require("../util/db");

function getYesterdayIST() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  istTime.setDate(istTime.getDate() - 1);
  return istTime.toISOString().split("T")[0];
}

async function getDailyReport(req, res) {
  try {
    const today = getYesterdayIST();

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

      // DAU yesterday — same query your dashboard uses
      pool.query(
        `WITH all_activities AS (
    SELECT user_id, modified_at AS activity_time 
      FROM user_chapter_submissions WHERE test_status = true 
      AND DATE(modified_at AT TIME ZONE 'Asia/Kolkata') = $1::date
    UNION ALL
    SELECT user_id, last_accessed 
      FROM user_pronounce_progress WHERE completed = true 
      AND DATE(last_accessed AT TIME ZONE 'Asia/Kolkata') = $1::date
    UNION ALL
    SELECT user_id, last_accessed 
      FROM user_conversation_progress WHERE completed = true 
      AND DATE(last_accessed AT TIME ZONE 'Asia/Kolkata') = $1::date
    UNION ALL
    SELECT user_id, completed_at 
      FROM user_story_progress WHERE completed = true 
      AND DATE(completed_at AT TIME ZONE 'Asia/Kolkata') = $1::date
    UNION ALL
    SELECT user_id::text, last_reviewed 
      FROM a2_flashcard_progress WHERE is_completed = true 
      AND DATE(last_reviewed AT TIME ZONE 'Asia/Kolkata') = $1::date
    UNION ALL
    SELECT user_id::text, last_practiced 
      FROM a2_grammar_progress WHERE is_completed = true 
      AND DATE(last_practiced AT TIME ZONE 'Asia/Kolkata') = $1::date
    UNION ALL
    SELECT user_id::text, last_practiced 
      FROM a2_listening_progress WHERE is_completed = true 
      AND DATE(last_practiced AT TIME ZONE 'Asia/Kolkata') = $1::date
    UNION ALL
    SELECT user_id::text, last_practiced 
      FROM a2_speaking_progress WHERE is_completed = true 
      AND DATE(last_practiced AT TIME ZONE 'Asia/Kolkata') = $1::date
    UNION ALL
    SELECT user_id::text, last_practiced 
      FROM a2_reading_progress WHERE is_completed = true 
      AND DATE(last_practiced AT TIME ZONE 'Asia/Kolkata') = $1::date
    UNION ALL
    SELECT user_id::text, last_attempted 
      FROM a2_test_progress WHERE is_fully_completed = true 
      AND DATE(last_attempted AT TIME ZONE 'Asia/Kolkata') = $1::date
  )
  SELECT DISTINCT
    u.fullname,
    u.username,
    u.current_profeciency_level
  FROM all_activities a
  JOIN app_user u ON a.user_id = u.user_id
  WHERE u.role = 'user'
  ORDER BY u.fullname`,
        [today],
      ),

      // New app installs today
      pool.query(
        `SELECT
            fullname,
            username,
            phone,
            signup_source,
            TO_CHAR(created_at AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM') AS install_time_ist
          FROM app_user
          WHERE DATE(created_at AT TIME ZONE 'Asia/Kolkata') = $1
            AND role = 'user'
          ORDER BY created_at ASC`,
        [today],
      ),

      // Session stats — active in last 24h and last 1h
      pool.query(
        `SELECT COUNT(*) FILTER (
    WHERE DATE(last_activity_at AT TIME ZONE 'Asia/Kolkata') = $1
  ) AS active_yesterday,
  COUNT(*) AS total_users
  FROM app_user
  WHERE role = 'user'`,
        [today],
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
