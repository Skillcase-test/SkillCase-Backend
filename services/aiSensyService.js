const axios = require("axios");
const AISENSY_API_URL = "https://backend.aisensy.com/campaign/t1/api/v2";
const AISENSY_API_KEY = process.env.AISENSY_API_KEY;

// Template IDs
const TEMPLATES = {
  REGISTRATION_CONFIRMATION:
    process.env.AISENSY_REGISTRATION_TEMPLATE_ID || "PLACEHOLDER_REG",
  EVENT_REMINDER: process.env.AISENSY_REMINDER_TEMPLATE_ID || "PLACEHOLDER_REM",
};

function formatPhoneNumber(phone) {
  if (!phone) return null;

  // Remove all non-digit characters
  let digits = phone.replace(/\D/g, "");

  if (digits.startsWith("91") && digits.length === 12) {
    return "+" + digits;
  }

  if (digits.length === 10) {
    return "+91" + digits;
  }

  // Invalid phone number
  return null;
}

function isValidPhone(phone) {
  if (!phone) return false;

  const digits = phone.replace(/\D/g, "");

  return (
    digits.length === 10 || (digits.length === 12 && digits.startsWith("91"))
  );
}

async function sendWhatsAppMessage(phone, templateId, params) {
  const formattedPhone = formatPhoneNumber(phone);

  if (!formattedPhone) {
    console.error("Invalid phone number:", phone);
    return { success: false, error: "Invalid phone number" };
  }

  if (!AISENSY_API_KEY) {
    console.warn("AiSensy API key not configured, skipping WhatsApp message");
    return { success: false, error: "API key not configured" };
  }

  try {
    const response = await axios.post(
      AISENSY_API_URL,
      {
        apiKey: AISENSY_API_KEY,
        campaignName: templateId,
        destination: formattedPhone,
        userName: params.name || "User",
        templateParams: Object.values(params),
      },
      {
        headers: { "Content-Type": "application/json" },
      }
    );

    console.log("AiSensy response:", response.data);
    return { success: true, data: response.data };
  } catch (error) {
    console.error("AiSensy API error:", error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

async function sendRegistrationConfirmation({
  phone,
  name,
  eventTitle,
  eventDate,
  eventTime,
}) {
  return sendWhatsAppMessage(phone, TEMPLATES.REGISTRATION_CONFIRMATION, {
    name,
    eventTitle,
    eventDate,
    eventTime,
  });
}

async function sendEventReminder({ phone, name, eventTitle, meetingLink }) {
  return sendWhatsAppMessage(phone, TEMPLATES.EVENT_REMINDER, {
    name,
    eventTitle,
    meetingLink,
  });
}

module.exports = {
  formatPhoneNumber,
  isValidPhone,
  sendRegistrationConfirmation,
  sendEventReminder,
};
