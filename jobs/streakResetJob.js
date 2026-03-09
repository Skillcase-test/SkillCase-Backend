const cron = require("node-cron");
const { pool } = require("../util/db");

async function runStreakReset() {
  try {
    // At midnight IST, reset streaks for users who did NOT complete yesterday
    // "yesterday" in IST context is: last_goal_date < today IST
    const result = await pool.query(
      `UPDATE user_streak
       SET current_streak = 0, streak_updated_at = CURRENT_TIMESTAMP
       WHERE current_streak > 0
         AND (
           last_goal_date IS NULL
           OR last_goal_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - INTERVAL '1 day'
         )
       RETURNING user_id`,
    );
    console.log(
      `[StreakReset] Reset ${result.rowCount} streaks at midnight IST`,
    );
  } catch (error) {
    console.error("[StreakReset] Error resetting streaks:", error);
  }
}

function initStreakResetJob() {
  // Runs at 00:01 AM IST every day
  cron.schedule(
    "1 0 * * *",
    async () => {
      console.log("[StreakReset] Running midnight IST streak reset...");
      await runStreakReset();
    },
    { timezone: "Asia/Kolkata" },
  );

  console.log("[StreakReset] Streak reset job scheduled at 00:01 IST daily");
}

module.exports = { initStreakResetJob };
