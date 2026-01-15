const cron = require("node-cron");
const { pool } = require("../util/db");
const { sendEventReminder } = require("../services/aiSensyService");

async function processEventReminders() {
  console.log("[EventReminder] Checking for pending reminders...");
  try {
    // Find registrations where:
    // 1. instance_date is within the next 1 hour
    // 2. reminder_sent is false
    // 3. User registered more than 1 hour before event (skip late registrations)
    // 4. Check for instance overrides and use custom time if present
    const query = `
  WITH effective_times AS (
    SELECT 
      er.registration_id,
      er.name,
      er.phone,
      er.instance_date,
      er.registered_at,
      e.title AS event_title,
      e.meeting_link,
      e.start_datetime,
      COALESCE(
        (er.instance_date + eio.custom_start_time),
        er.instance_date
      ) AS effective_event_time
    FROM event_registration er
    JOIN event e ON er.event_id = e.event_id
    LEFT JOIN event_instance_override eio 
      ON e.event_id = eio.event_id 
      AND DATE(er.instance_date) = eio.instance_date
    WHERE 
      er.reminder_sent = FALSE
      AND er.instance_date IS NOT NULL
  )
  SELECT *
  FROM effective_times
  WHERE 
    effective_event_time > NOW()
    AND effective_event_time <= NOW() + INTERVAL '1 hour'
    AND effective_event_time - INTERVAL '1 hour' > registered_at
`;

    const result = await pool.query(query);

    console.log(
      `[EventReminder] Found ${result.rows.length} reminders to send`
    );

    for (const reg of result.rows) {
      try {
        await sendEventReminder({
          phone: reg.phone,
          name: reg.name,
          eventTitle: reg.event_title,
          meetingLink: reg.meeting_link,
        });

        // Mark reminder as sent
        await pool.query(
          "UPDATE event_registration SET reminder_sent = TRUE WHERE registration_id = $1",
          [reg.registration_id]
        );

        console.log(
          `[EventReminder] Sent reminder to ${reg.name} for ${reg.event_title}`
        );
      } catch (err) {
        console.error(
          `[EventReminder] Failed for registration ${reg.registration_id}:`,
          err
        );
      }
    }
  } catch (err) {
    console.error("[EventReminder] Job failed:", err);
  }
}

function initEventReminderJob() {
  console.log("[EventReminder] Initializing job scheduler...");

  // Run every 15 minutes
  cron.schedule("*/15 * * * *", processEventReminders);

  console.log("[EventReminder] Job scheduled to run every 15 minutes");
}

module.exports = { initEventReminderJob, processEventReminders };
