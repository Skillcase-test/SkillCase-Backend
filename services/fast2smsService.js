const axios = require("axios");

const FAST2SMS_URL = "https://www.fast2sms.com/dev/bulkV2";

const API_KEY = process.env.FAST2SMS_API_KEY;

const ROUTE = "dlt";

const SENDER_ID = "SKLCSE";
const TEMPLATE_ID = "199663";

function generateOtp() {
  let otp = "";
  for (let i = 0; i < 6; i++) {
    otp += Math.floor(Math.random() * 10);
  }
  return otp;
}

async function sendOtp(phone, otp) {
  try {
    // Normalize phone - remove country code if present
    const normalizedPhone = phone.replace(/\D/g, "").slice(-10);

    const params = new URLSearchParams({
      authorization: API_KEY,
      route: ROUTE,
      sender_id: SENDER_ID,
      message: TEMPLATE_ID,
      variables_values: otp,
      flash: "0",
      numbers: normalizedPhone,
      schedule_time: "",
    });

    const response = await axios.get(`${FAST2SMS_URL}?${params.toString()}`, {
      headers: { "cache-control": "no-cache" },
      timeout: 30000,
    });

    return { success: true, data: response.data };
  } catch (error) {
    console.error("Fast2SMS Error:", error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  generateOtp,
  sendOtp,
};
