const cron = require("node-cron");
const { pool } = require("../util/db");

// Cleanup old OTPs
function startOtpCleanupJob() {
  // Run at 3 AM IST
  cron.schedule(
    "0 3 * * *",
    async () => {
    console.log("Running OTP cleanup job...");

    try {
      const result = await pool.query(
        "DELETE FROM user_otp WHERE created_at < NOW() - INTERVAL '24 hours'"
      );
    } catch (error) {
      console.error("OTP cleanup error:", error);
    }
  }, { timezone: "Asia/Kolkata" });
}

module.exports = { startOtpCleanupJob };
