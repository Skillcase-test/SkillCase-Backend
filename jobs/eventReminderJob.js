const cron = require("node-cron");
const { pool } = require("../util/db");
const { sendEventReminder } = require("../services/aiSensyService");

async function processEventReminders() {
  console.log("[EventReminder] Checking for pending reminders...");
  try {
    // Early exit: Check if any reminders are pending before running expensive query
    const quickCheck = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM event_registration 
        WHERE reminder_sent = FALSE 
        AND instance_date > NOW() 
        AND instance_date <= NOW() + INTERVAL '2 hours'
      ) AS has_pending
    `);

    if (!quickCheck.rows[0].has_pending) {
      console.log("[EventReminder] No pending reminders, skipping...");
      return;
    }

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
    AND effective_event_time - INTERVAL '1 hour' > (registered_at - INTERVAL '5 hours 30 minutes')
`;

    const result = await pool.query(query);

    console.log(
      `[EventReminder] Found ${result.rows.length} reminders to send`,
    );

    // Track successfully sent reminders for batch update
    const sentIds = [];

    for (const reg of result.rows) {
      try {
        await sendEventReminder({
          phone: reg.phone,
          name: reg.name,
          eventTitle: reg.event_title,
          meetingLink: reg.meeting_link,
        });

        sentIds.push(reg.registration_id);

        console.log(
          `[EventReminder] Sent reminder to ${reg.name} for ${reg.event_title}`,
        );
      } catch (err) {
        console.error(
          `[EventReminder] Failed for registration ${reg.registration_id}:`,
          err,
        );
      }
    }

    // Batch update: Mark all sent reminders in a single query
    if (sentIds.length > 0) {
      await pool.query(
        "UPDATE event_registration SET reminder_sent = TRUE WHERE registration_id = ANY($1::int[])",
        [sentIds],
      );
      console.log(
        `[EventReminder] Batch updated ${sentIds.length} registrations as sent`,
      );
    }
  } catch (err) {
    console.error("[EventReminder] Job failed:", err);
  }
}

function initEventReminderJob() {
  console.log("[EventReminder] Initializing job scheduler...");

  // Run at 5:00, 5:45, 6:30, 7:15, 8:00, 8:45, 9:30, 10:00 PM IST (11:30, 12:15, 13:00, 13:45, 14:30, 15:15, 16:00, 16:30 UTC)
  // Only up to 10:00 PM, not after
  cron.schedule(
    "30 11 * * *,15 12 * * *,0 13 * * *,45 13 * * *,30 14 * * *,15 15 * * *,0 16 * * *,30 16 * * *",
    processEventReminders,
  );

  console.log(
    "[EventReminder] Job scheduled to run at 5:00, 5:45, 6:30, 7:15, 8:00, 8:45, 9:30, and 10:00 PM IST",
  );
}

module.exports = { initEventReminderJob, processEventReminders };
