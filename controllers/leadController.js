const { pool } = require("../util/db");
const { sendWhatsAppMessage } = require("../services/aiSensyService");
const axios = require("axios");

// Template configuration
const MESSAGE_TEMPLATES = [
  {
    templateName: "missed_call_followup",
    campaignName: "Whatsapp Lead campaign Template 1",
    delayHours: 0,
    mediaUrl:
      "https://d3jt6ku4g6z5l8.cloudfront.net/IMAGE/6659a5ebe2335f0e51547019/9714535_image1.jpeg",
  },
  {
    templateName: "german_language_training",
    campaignName: "Whatsapp Lead campaign Template 2",
    delayHours: 24,
    mediaUrl:
      "https://d3jt6ku4g6z5l8.cloudfront.net/IMAGE/6659a5ebe2335f0e51547019/1765155_image2.jpeg",
  },
  {
    templateName: "cultural_training",
    campaignName: "Whatsapp Lead campaign Template 3",
    delayHours: 48,
    mediaUrl:
      "https://d3jt6ku4g6z5l8.cloudfront.net/IMAGE/6659a5ebe2335f0e51547019/9067900_image3.jpeg",
  },
  {
    templateName: "student_testimonial",
    campaignName: "Whatsapp Lead campaign Template 4",
    delayHours: 72,
    mediaUrl:
      "https://d3jt6ku4g6z5l8.cloudfront.net/IMAGE/6659a5ebe2335f0e51547019/5865714_image4.jpeg",
  },
];

function formatPhoneNumber(phone) {
  // Remove all non-digit characters
  let cleaned = phone.replace(/\D/g, "");
  // Remove leading zeros
  cleaned = cleaned.replace(/^0+/, "");
  // If doesn't start with 91, add it
  if (!cleaned.startsWith("91")) {
    cleaned = "91" + cleaned;
  }
  return cleaned;
}

async function scheduleMessagesForLead(leadId, name, phone) {
  const now = new Date();
  for (const template of MESSAGE_TEMPLATES) {
    const scheduledAt = new Date(
      now.getTime() + template.delayHours * 60 * 60 * 1000
    );
    await pool.query(
      `INSERT INTO scheduled_messages 
       (lead_id, template_name, campaign_name, scheduled_at, status)
       VALUES ($1, $2, $3, $4, 'pending')`,
      [leadId, template.templateName, template.campaignName, scheduledAt]
    );
  }



  // Send the first message immediately
  const firstTemplate = MESSAGE_TEMPLATES[0];
  const result = await sendWhatsAppMessage(
    firstTemplate.campaignName,
    phone,
    name,
    firstTemplate.mediaUrl
  );

  if (result.success) {
    // Mark first message as sent
    await pool.query(
      `UPDATE scheduled_messages 
       SET status = 'sent', sent_at = NOW() 
       WHERE lead_id = $1 AND template_name = $2`,
      [leadId, firstTemplate.templateName]
    );

  } else {
    console.error(
      `[Lead] Failed to send first message to ${phone}:`,
      result.error
    );
  }
}

async function handleWebsiteLead(req, res) {
  try {
    const { name, phone, qualification, experience, source } = req.body;
    // Validate required fields
    if (!name || !phone) {
      return res.status(400).json({ error: "Name and phone are required" });
    }
    const formattedPhone = formatPhoneNumber(phone);
    // Check for duplicate lead (same phone in last 24 hours)
    const duplicateCheck = await pool.query(
      `SELECT id FROM leads 
       WHERE phone = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
      [formattedPhone]
    );
    if (duplicateCheck.rows.length > 0) {

      return res.status(200).json({
        success: true,
        message: "Lead already registered recently",
      });
    }

    // Insert lead into database
    const result = await pool.query(
      `INSERT INTO leads (name, phone, qualification, experience, source)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        name,
        formattedPhone,
        qualification || null,
        experience || null,
        source || "website",
      ]
    );

    const leadId = result.rows[0].id;
    console.log(
      `[Lead] New website lead created: ${leadId} - ${name} (${formattedPhone})`
    );

    // Schedule all messages (first one sends immediately)
    await scheduleMessagesForLead(leadId, name, formattedPhone);
    res.status(200).json({ success: true, leadId });
  } catch (error) {
    console.error("[Lead] Error handling website lead:", error);
    res.status(500).json({ error: "Failed to process lead" });
  }
}

function verifyFacebookWebhook(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const VERIFY_TOKEN = process.env.FB_WEBHOOK_VERIFY_TOKEN;
  if (mode === "subscribe" && token === VERIFY_TOKEN) {

    res.status(200).send(challenge);
  } else {
    console.error("[Facebook] Webhook verification failed");
    res.status(403).send("Forbidden");
  }
}

async function handleFacebookWebhook(req, res) {
  try {
    const body = req.body;
    // Acknowledge receipt immediately
    res.status(200).send("EVENT_RECEIVED");

    if (body.object === "page") {
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          if (change.field === "leadgen") {
            const leadgenId = change.value.leadgen_id;
            const pageId = change.value.page_id;

            // Fetch lead details from Facebook Graph API
            await fetchAndProcessFacebookLead(leadgenId);
          }
        }
      }
    }
  } catch (error) {
    console.error("[Facebook] Error handling webhook:", error);
  }
}

async function fetchAndProcessFacebookLead(leadgenId) {
  try {
    const accessToken = process.env.FB_PAGE_ACCESS_TOKEN;
    if (!accessToken) {
      console.error("[Facebook] FB_PAGE_ACCESS_TOKEN not configured");
      return;
    }
    const response = await axios.get(
      `https://graph.facebook.com/v18.0/${leadgenId}`,
      {
        params: {
          access_token: accessToken,
          fields: "field_data",
        },
      }
    );
    const fieldData = response.data.field_data || [];
    // Extract fields from Facebook lead
    let name = "";
    let phone = "";
    for (const field of fieldData) {
      const fieldName = field.name.toLowerCase();
      const fieldValue = field.values?.[0] || "";
      if (fieldName.includes("name") || fieldName === "full_name") {
        name = fieldValue;
      } else if (
        fieldName.includes("phone") ||
        fieldName === "phone_number" ||
        fieldName === "mobile"
      ) {
        phone = fieldValue;
      }
    }
    if (!name || !phone) {
      console.error(
        "[Facebook] Could not extract name/phone from lead:",
        leadgenId
      );
      return;
    }
    const formattedPhone = formatPhoneNumber(phone);
    const duplicateCheck = await pool.query(
      `SELECT id FROM leads 
       WHERE phone = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
      [formattedPhone]
    );
    if (duplicateCheck.rows.length > 0) {

      return;
    }
    // Insert lead
    const result = await pool.query(
      `INSERT INTO leads (name, phone, source, facebook_lead_id)
       VALUES ($1, $2, 'facebook', $3)
       RETURNING id`,
      [name, formattedPhone, leadgenId]
    );
    const leadId = result.rows[0].id;
    console.log(
      `[Facebook] New lead created: ${leadId} - ${name} (${formattedPhone})`
    );
    // Schedule messages
    await scheduleMessagesForLead(leadId, name, formattedPhone);
  } catch (error) {
    console.error("[Facebook] Error fetching lead details:", error.message);
  }
}

module.exports = {
  handleWebsiteLead,
  verifyFacebookWebhook,
  handleFacebookWebhook,
};
