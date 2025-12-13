const jwt = require("jsonwebtoken");
const { pool } = require("../util/db");
const config = require("../config/configuration");
const { v4: uuidv4 } = require("uuid");

// This endpoint receives pre-validated user data from frontend
async function createToken(req, res) {
  const { phone, name, email } = req.body;
  if (!phone) {
    return res.status(400).json({ success: false, error: "Phone required" });
  }

  const origin = req.get("Origin");
  const trustedOrigins = [
    "https://learner.skillcase.in",
    "https://skillcase.in",
    "http://localhost:5173",
  ];

  if (!origin || !trustedOrigins.includes(origin)) {
    return res
      .status(403)
      .json({ success: false, error: "Unauthorized origin" });
  }

  try {
    // Normalize phone
    const normalizedPhone = phone.replace(/\D/g, "").slice(-10);
    // Check if user exists
    let result = await pool.query("SELECT * FROM app_user WHERE number = $1", [
      normalizedPhone,
    ]);
    let user;
    if (result.rows.length === 0) {
      // Create new user
      const newId = uuidv4();
      await pool.query(
        "INSERT INTO app_user (user_id, username, number, role, current_profeciency_level) VALUES ($1, $2, $3, $4, $5)",
        [newId, name || "User", normalizedPhone, "user", "A1"]
      );
      user = {
        user_id: newId,
        username: name,
        role: "user",
        current_profeciency_level: "A1",
      };
    } else {
      user = result.rows[0];
    }
    // Create JWT
    const token = jwt.sign(
      {
        user_id: user.user_id,
        username: user.username,
        role: user.role,
        user_prof_level: user.current_profeciency_level,
      },
      config.JWT_SECRET_KEY,
      { expiresIn: "60d" }
    );
    res.json({
      success: true,
      user: {
        user_id: user.user_id,
        username: user.username,
        role: user.role,
        user_prof_level: user.current_profeciency_level,
      },
      token,
    });
  } catch (error) {
    console.error("SSO Error:", error);
    res.status(500).json({ success: false, error: "Token creation failed" });
  }
}
module.exports = { createToken };
