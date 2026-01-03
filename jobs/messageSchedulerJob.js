const cron = require("node-cron");
const { pool } = require("../util/db");

const { sendWhatsAppMessage } = require("../services/aiSensyService");

const MAX_RETRIES = 3;

// Template configuration 
const MESSAGE_TEMPLATES = {
  missed_call_followup: {
    campaignName: "Whatsapp Lead campaign Template 1",
    mediaUrl:
      "https://d3jt6ku4g6z5l8.cloudfront.net/IMAGE/6659a5ebe2335f0e51547019/9714535_image1.jpeg",
  },
  german_language_training: {
    campaignName: "Whatsapp Lead campaign Template 2",
    mediaUrl:
      "https://d3jt6ku4g6z5l8.cloudfront.net/IMAGE/6659a5ebe2335f0e51547019/1765155_image2.jpeg",
  },
  cultural_training: {
    campaignName: "Whatsapp Lead campaign Template 3",
    mediaUrl:
      "https://d3jt6ku4g6z5l8.cloudfront.net/IMAGE/6659a5ebe2335f0e51547019/9067900_image3.jpeg",
  },
  student_testimonial: {
    campaignName: "Whatsapp Lead campaign Template 4",
    mediaUrl:
      "https://d3jt6ku4g6z5l8.cloudfront.net/IMAGE/6659a5ebe2335f0e51547019/5865714_image4.jpeg",
  },
};

async function processScheduledMessages() {


  try {
    // Get all pending messages that are due
    const result = await pool.query(
      `SELECT sm.id, sm.lead_id, sm.template_name, sm.campaign_name, sm.retry_count,
              l.name, l.phone
       FROM scheduled_messages sm
       JOIN leads l ON sm.lead_id = l.id
       WHERE sm.status = 'pending' 
         AND sm.scheduled_at <= NOW()
       ORDER BY sm.scheduled_at ASC
       LIMIT 100`
    );

    const messages = result.rows;
    if (messages.length === 0) {

      return;
    }



    for (const msg of messages) {
      const { id, campaign_name, template_name, name, phone, retry_count } = msg;
      
      // Get media URL from template config
      const templateConfig = MESSAGE_TEMPLATES[template_name];
      const mediaUrl = templateConfig ? templateConfig.mediaUrl : null;
      
      // Send the message
      const sendResult = await sendWhatsAppMessage(
        campaign_name,
        phone,
        name,
        mediaUrl
      );
      if (sendResult.success) {
        // Mark as sent
        await pool.query(
          `UPDATE scheduled_messages 
           SET status = 'sent', sent_at = NOW() 
           WHERE id = $1`,
          [id]
        );

      } else {
        if (retry_count >= MAX_RETRIES) {
          // Max retries reached, mark as failed
          await pool.query(
            `UPDATE scheduled_messages 
             SET status = 'failed', error_message = $2 
             WHERE id = $1`,
            [id, sendResult.error]
          );
          console.error(
            `[Scheduler] Message ${id} failed after ${MAX_RETRIES} retries`
          );
        } else {
          // Schedule for retry (add 1 hour delay)
          await pool.query(
            `UPDATE scheduled_messages 
             SET retry_count = retry_count + 1,
                 scheduled_at = NOW() + INTERVAL '1 hour',
                 error_message = $2
             WHERE id = $1`,
            [id, sendResult.error]
          );

        }
      }
      // Small delay between messages to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

  } catch (error) {
    console.error("[Scheduler] Error processing messages:", error);
  }
}

function initMessageSchedulerJob() {
  cron.schedule(
    "0 * * * *", // Every hour at minute 0
    processScheduledMessages,
    { timezone: "Asia/Kolkata" }
  );
  console.log(
    "[Scheduler] Message scheduler job initialized (runs every hour)"
  );
}

module.exports = {
  initMessageSchedulerJob,
  processScheduledMessages,
};
