const axios = require("axios");

const AISENSY_API_KEY = process.env.AISENSY_API_KEY;
const AISENSY_BASE_URL = "https://backend.aisensy.com/campaign/t1/api/v2";

async function sendWhatsAppMessage(campaignName, phone, name, mediaUrl = null) {
  try {
    const payload = {
      apiKey: AISENSY_API_KEY,
      campaignName: campaignName,
      destination: phone,
      userName: name || "User",
      templateParams: [name || "User"], // {{1}} = name
    };

    if (mediaUrl) {
      payload.media = {
        url: mediaUrl,
        filename: "image.png",
      };
    }



    const response = await axios.post(AISENSY_BASE_URL, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 30000,
    });



    return { success: true, data: response.data };
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.message;
    console.error(
      `[AiSensy] Failed to send message to ${phone}:`,
      errorMessage
    );
    return { success: false, error: errorMessage };
  }
}

module.exports = { sendWhatsAppMessage };
