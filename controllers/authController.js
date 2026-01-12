const jwt = require("jsonwebtoken");
const { pool } = require("../util/db");
const { v4: uuidv4 } = require("uuid");

const config = require("../config/configuration");

const { generateOtp, sendOtp } = require("../services/fast2smsService");
const { insertOrGetContact } = require("../services/biginService");

const OTP_EXPIRY_SECONDS = 90;

// Rate limit for OTP requests
const OTP_RATE_LIMIT = 3;
const OTP_RATE_WINDOW_MINUTES = 10;

async function checkOtpRateLimit(phone) {
  const result = await pool.query(
    `SELECT COUNT(*) as count FROM user_otp 
     WHERE phone = $1 
     AND created_at > NOW() - INTERVAL '${OTP_RATE_WINDOW_MINUTES} minutes'`,
    [phone]
  );
  return parseInt(result.rows[0].count) >= OTP_RATE_LIMIT;
}

// Normalize phone number to last 10 digits
function normalizePhone(phone) {
  return phone.replace(/\D/g, "").slice(-10);
}

function mapLanguageLevelToProficiency(languageLevel) {
  const mapping = {
    "Yet to Start Learning": "A1",
    "A1 Completed": "A2",
    "A2 Completed": "B1",
    "B1 - in progress": "B1",
    "B1 Completed": "B2",
    "B2 - in progress": "B2",
    "B2 Completed": "C1",
  };
  return mapping[languageLevel] || "A1";
}

// Check if OTP has expired
function isOtpExpired(createdAt) {
  const now = Date.now();

  // PostgreSQL TIMESTAMP is stored without timezone
  let createdTime;
  if (createdAt instanceof Date) {
    createdTime = createdAt.getTime();
  } else {
    // If string, parse as UTC
    const dateStr = createdAt.toString();
    // Check for existing timezone info
    if (dateStr.includes("GMT") || dateStr.includes("Z")) {
      createdTime = new Date(createdAt).getTime();
    } else {
      // Append Z to treat as UTC
      createdTime = new Date(createdAt + "Z").getTime();
    }
  }

  const diffSeconds = (now - createdTime) / 1000;

  return diffSeconds > OTP_EXPIRY_SECONDS;
}

// Send OTP for signup
async function sendSignupOtp(req, res) {
  const { phone, countrycode } = req.body;

  if (!phone) {
    return res
      .status(400)
      .json({ status: "error", message: "Phone is required" });
  }

  const normalizedPhone = normalizePhone(phone);

  try {
    // Check rate limit
    const isRateLimited = await checkOtpRateLimit(normalizedPhone);
    if (isRateLimited) {
      return res.status(429).json({
        status: "rate_limited",
        message: "Too many OTP requests. Please try again after 10 minutes.",
      });
    }

    // Check if user already exists
    const existingUser = await pool.query(
      "SELECT * FROM app_user WHERE phone = $1 AND status = 1",
      [normalizedPhone]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        status: "already",
        message: "Candidate already exist! Please login",
      });
    }

    // Check for pending user
    const pendingUser = await pool.query(
      "SELECT * FROM app_user WHERE phone = $1 AND status = 0",
      [normalizedPhone]
    );

    let userId;

    if (pendingUser.rows.length > 0) {
      // Use existing pending user
      userId = pendingUser.rows[0].user_id;
      await pool.query(
        `UPDATE app_user SET countrycode = $1, modified_at = NOW() WHERE user_id = $2`,
        [countrycode || "+91", userId]
      );
    } else {
      // Create new pending user
      userId = uuidv4();
      await pool.query(
        `INSERT INTO app_user 
          (user_id, username, phone, number, countrycode, role, status, 
           current_profeciency_level, password)
        VALUES ($1, $2, $3, $3, $4, 'user', 0, 'A1', '')`,
        [userId, normalizedPhone, normalizedPhone, countrycode || "+91"]
      );
    }

    // Generate and save OTP
    const otp = generateOtp();

    // Delete any existing OTPs for this phone
    await pool.query("DELETE FROM user_otp WHERE phone = $1", [
      normalizedPhone,
    ]);

    // Insert new OTP
    await pool.query(
      "INSERT INTO user_otp (user_id, phone, otp, status) VALUES ($1, $2, $3, 0)",
      [userId, normalizedPhone, otp]
    );

    // Send OTP via Fast2SMS
    const smsResult = await sendOtp(normalizedPhone, otp);

    if (!smsResult.success) {
      console.error("SMS sending failed:", smsResult.error);
    }

    res.json({
      status: "sendotp",
      message: "OTP sent successfully",
      user_id: userId,
    });
  } catch (error) {
    console.error("Signup OTP error:", error);
    res.status(500).json({ status: "error", message: "Failed to send OTP" });
  }
}

// Verify OTP for signup
async function verifySignupOtp(req, res) {
  const { phone, otp } = req.body;

  if (!phone || !otp) {
    return res
      .status(400)
      .json({ status: "error", message: "Phone and OTP are required" });
  }

  const normalizedPhone = normalizePhone(phone);

  try {
    // Calculate OTP age in PostgreSQL
    const otpResult = await pool.query(
      `SELECT *, EXTRACT(EPOCH FROM (NOW() - created_at)) as age_seconds 
       FROM user_otp WHERE phone = $1 AND status = 0 
       ORDER BY created_at DESC LIMIT 1`,
      [normalizedPhone]
    );

    if (otpResult.rows.length === 0) {
      return res.status(400).json({
        status: "error",
        message: "No OTP found. Please request again.",
      });
    }

    const otpRecord = otpResult.rows[0];

    // Use age_seconds from database
    if (otpRecord.age_seconds > OTP_EXPIRY_SECONDS) {
      return res.status(400).json({
        status: "expired",
        message: "OTP expired. Please request again.",
      });
    }

    if (otpRecord.otp !== otp) {
      return res
        .status(400)
        .json({ status: "incorrect", message: "OTP incorrect please check" });
    }

    // Mark OTP as verified
    await pool.query(
      "UPDATE user_otp SET status = 1, updated_at = NOW() WHERE id = $1",
      [otpRecord.id]
    );

    // OTP verified, user can proceed to personal details
    res.json({
      status: "success",
      message: "OTP verified. Please complete your profile.",
      user_id: otpRecord.user_id,
    });
  } catch (error) {
    console.error("Verify signup OTP error:", error);
    res.status(500).json({ status: "error", message: "Verification failed" });
  }
}

// Complete signup with personal details
async function completeSignup(req, res) {
  const {
    phone,
    countrycode,
    fullname,
    email,
    qualification,
    language_level,
    experience,
  } = req.body;

  if (!phone || !fullname || !email) {
    return res.status(400).json({
      status: "error",
      message: "Phone, name, and email are required",
    });
  }

  const normalizedPhone = normalizePhone(phone);

  try {
    // Check if user exists
    const userResult = await pool.query(
      "SELECT * FROM app_user WHERE phone = $1",
      [normalizedPhone]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({
        status: "idnotfound",
        message: "User not found. Please start signup again.",
      });
    }

    const user = userResult.rows[0];

    // Check if email is already used
    const emailCheck = await pool.query(
      "SELECT * FROM app_user WHERE email = $1 AND user_id != $2",
      [email, user.user_id]
    );

    if (emailCheck.rows.length > 0) {
      return res.status(400).json({
        status: "emailalready",
        message: "Email already registered",
      });
    }

    const proficiencyLevel = mapLanguageLevelToProficiency(language_level);

    await pool.query(
      `UPDATE app_user SET 
        fullname = $1, username = $1, email = $2, countrycode = $3,
        qualification = $4, language_level = $5, experience = $6,
        current_profeciency_level = $7, status = 1, modified_at = NOW()
      WHERE user_id = $8`,
      [
        fullname,
        email,
        countrycode || "+91",
        qualification,
        language_level,
        experience,
        proficiencyLevel,
        user.user_id,
      ]
    );

    insertOrGetContact({
      fullname,
      phone: normalizedPhone,
      email,
      language_level,
      qualification,
      experience,
    })
      .then((result) => {
        console.log("Bigin CRM Result:", result.status);
        console.log("Zoho ID:", result.zohoId);
        console.log("User:", fullname, "|", normalizedPhone);
        
        if (result.zohoId) {
          pool.query("UPDATE app_user SET zohoid = $1 WHERE user_id = $2", [
            result.zohoId,
            user.user_id,
          ]);
        }
      })
      .catch((err) => {
        console.error("Bigin CRM Error:", err.message);
        console.error("Failed for user:", fullname, "|", normalizedPhone);
      });

    // Generate JWT with new proficiency level
    const token = jwt.sign(
      {
        user_id: user.user_id,
        username: fullname,
        role: user.role,
        user_prof_level: proficiencyLevel,
        onboarding_completed: false,
      },
      config.JWT_SECRET_KEY,
      { expiresIn: "60d" }
    );

    res.json({
      status: "success",
      message: "Signup successful",
      user: {
        user_id: user.user_id,
        username: fullname,
        role: user.role,
        user_prof_level: proficiencyLevel,
        onboarding_completed: false,
      },
      token,
    });
  } catch (error) {
    console.error("Complete signup error:", error);
    res.status(500).json({ status: "error", message: "Signup failed" });
  }
}
// Send OTP to existing verified user
async function sendLoginOtp(req, res) {
  const { phone } = req.body;

  if (!phone) {
    return res
      .status(400)
      .json({ status: "error", message: "Phone is required" });
  }

  const normalizedPhone = normalizePhone(phone);

  try {
    // Check rate limit
    const isRateLimited = await checkOtpRateLimit(normalizedPhone);
    if (isRateLimited) {
      return res.status(429).json({
        status: "rate_limited",
        message: "Too many OTP requests. Please try again after 10 minutes.",
      });
    }

    const userResult = await pool.query(
      "SELECT * FROM app_user WHERE phone = $1 AND status = 1",
      [normalizedPhone]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({
        status: "not_found",
        message: "User not found. Please signup.",
      });
    }

    const user = userResult.rows[0];

    // Generate and save OTP
    const otp = generateOtp();

    // Delete any existing OTPs for this phone
    const deleteResult = await pool.query(
      "DELETE FROM user_otp WHERE phone = $1",
      [normalizedPhone]
    );

    // Insert new OTP
    await pool.query(
      "INSERT INTO user_otp (user_id, phone, otp, status) VALUES ($1, $2, $3, 0)",
      [user.user_id, normalizedPhone, otp]
    );

    // Send OTP
    const smsResult = await sendOtp(normalizedPhone, otp);

    if (!smsResult.success) {
      console.error("SMS sending failed:", smsResult.error);
    }

    res.json({
      status: "sendotp",
      message: "OTP sent successfully",
      user_id: user.user_id,
    });
  } catch (error) {
    console.error("Login OTP error:", error);
    res.status(500).json({ status: "error", message: "Failed to send OTP" });
  }
}
// Verify OTP and login
async function verifyLoginOtp(req, res) {
  const { phone, otp, timer } = req.body;

  if (!phone || !otp) {
    return res
      .status(400)
      .json({ status: "error", message: "Phone and OTP are required" });
  }

  const normalizedPhone = normalizePhone(phone);

  try {
    // Calculate OTP age in PostgreSQL
    const otpResult = await pool.query(
      `SELECT *, EXTRACT(EPOCH FROM (NOW() - created_at)) as age_seconds 
       FROM user_otp WHERE phone = $1 AND status = 0 
       ORDER BY created_at DESC LIMIT 1`,
      [normalizedPhone]
    );

    if (otpResult.rows.length === 0) {
      return res.status(400).json({
        status: "error",
        message: "No OTP found. Please request again.",
      });
    }

    const otpRecord = otpResult.rows[0];

    if (timer !== undefined && timer <= 0) {
      return res.status(400).json({
        status: "expired",
        message: "OTP expired. Please request again.",
      });
    }

    // Use age_seconds from database
    if (otpRecord.age_seconds > OTP_EXPIRY_SECONDS) {
      return res.status(400).json({
        status: "expired",
        message: "OTP expired. Please request again.",
      });
    }

    if (otpRecord.otp !== otp) {
      return res.status(400).json({ status: "error", message: "Invalid OTP" });
    }

    await pool.query(
      "UPDATE user_otp SET status = 1, updated_at = NOW() WHERE id = $1",
      [otpRecord.id]
    );

    const userResult = await pool.query(
      "SELECT * FROM app_user WHERE user_id = $1",
      [otpRecord.user_id]
    );

    const user = userResult.rows[0];

    const token = jwt.sign(
      {
        user_id: user.user_id,
        username: user.fullname || user.username,
        role: user.role,
        user_prof_level: user.current_profeciency_level,
        onboarding_completed: user.onboarding_completed,
      },
      config.JWT_SECRET_KEY,
      { expiresIn: "60d" }
    );

    res.json({
      status: "success",
      message: "Login successful",
      user: {
        user_id: user.user_id,
        username: user.fullname || user.username,
        role: user.role,
        user_prof_level: user.current_profeciency_level,
        onboarding_completed: user.onboarding_completed,
      },
      token,
    });
  } catch (error) {
    console.error("Verify login OTP error:", error);
    res.status(500).json({ status: "error", message: "Verification failed" });
  }
}

// Resend OTP
async function resendOtp(req, res) {
  const { phone } = req.body;

  if (!phone) {
    return res
      .status(400)
      .json({ status: "error", message: "Phone is required" });
  }

  const normalizedPhone = normalizePhone(phone);

  try {
    // Check rate limit
    const isRateLimited = await checkOtpRateLimit(normalizedPhone);
    if (isRateLimited) {
      return res.status(429).json({
        status: "rate_limited",
        message: "Too many OTP requests. Please try again after 10 minutes.",
      });
    }

    const userResult = await pool.query(
      "SELECT * FROM app_user WHERE phone = $1",
      [normalizedPhone]
    );

    if (userResult.rows.length === 0) {
      return res
        .status(400)
        .json({ status: "error", message: "User not found" });
    }

    const user = userResult.rows[0];

    const otp = generateOtp();

    await pool.query("DELETE FROM user_otp WHERE phone = $1", [
      normalizedPhone,
    ]);

    await pool.query(
      "INSERT INTO user_otp (user_id, phone, otp, status) VALUES ($1, $2, $3, 0)",
      [user.user_id, normalizedPhone, otp]
    );

    const smsResult = await sendOtp(normalizedPhone, otp);

    if (!smsResult.success) {
      console.error("SMS sending failed:", smsResult.error);
    }

    res.json({
      status: "sendotp",
      message: "OTP resent successfully",
    });
  } catch (error) {
    console.error("Resend OTP error:", error);
    res.status(500).json({ status: "error", message: "Failed to resend OTP" });
  }
}

module.exports = {
  sendSignupOtp,
  verifySignupOtp,
  completeSignup,
  sendLoginOtp,
  verifyLoginOtp,
  resendOtp,
};
