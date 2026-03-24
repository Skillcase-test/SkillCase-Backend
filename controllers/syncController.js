const { pool } = require("../util/db");
const { v4: uuidv4 } = require("uuid");

// Normalize any phone format to last 10 digits
function normalizePhone(phone) {
  return String(phone).replace(/\D/g, "").slice(-10);
}

// POST /api/sync/user/create
// Called by PHP when a candidate registers on the main website
async function receiveUserCreate(req, res) {
  const { phone, fullname, email, candidate_id } = req.body;

  if (!phone) {
    return res.status(400).json({ msg: "Phone required" });
  }

  const normalized = normalizePhone(phone);

  try {
    const existing = await pool.query(
      "SELECT user_id FROM app_user WHERE phone = $1",
      [normalized],
    );

    if (existing.rows.length > 0) {
      // User already exists — just update the link
      await pool.query(
        "UPDATE app_user SET main_site_id = $1, modified_at = CURRENT_TIMESTAMP WHERE user_id = $2",
        [candidate_id, existing.rows[0].user_id],
      );
      return res.status(200).json({
        user_id: existing.rows[0].user_id,
        already_exists: true,
      });
    }

    // Normalize gender capitalization for Learner UI (e.g. "male" -> "Male")
    let genderVal = req.body.gender || null;
    if (genderVal) {
      genderVal = genderVal.charAt(0).toUpperCase() + genderVal.slice(1).toLowerCase();
    }

    // Create a new user — OTP-based login, so empty password is fine
    const newId = uuidv4();
    await pool.query(
      `INSERT INTO app_user
        (user_id, username, phone, number, countrycode, role, status,
         current_profeciency_level, password, fullname, email, main_site_id,
         qualification, language_level, experience, gender, dob)
       VALUES ($1, $2, $3, $3, '+91', 'user', 1, 'A1', '', $4, $5, $6, $7, $8, $9, $10, $11::DATE)`,
      [
        newId,
        req.body.fullname || normalized,
        normalized,
        req.body.fullname || null,
        req.body.email || null,
        req.body.candidate_id,
        req.body.qualification || null,
        req.body.language_level || null,
        req.body.experience || null,
        genderVal,
        req.body.dob || null
      ],
    );

    return res.status(201).json({ user_id: newId });
  } catch (err) {
    console.error("Sync receiveUserCreate error:", err);
    return res.status(500).json({ msg: "Failed to create user" });
  }
}

// PUT /api/sync/user/profile
// Called by PHP when a candidate updates their profile on the main website
async function receiveProfileUpdate(req, res) {
  const {
    phone,
    fullname,
    email,
    dob,
    gender,
    qualification,
    language_level,
    experience,
  } = req.body;

  if (!phone) {
    return res.status(400).json({ msg: "Phone required" });
  }

  const normalized = normalizePhone(phone);

  // Normalize gender capitalization (e.g. "male" -> "Male")
  let genderVal = gender || null;
  if (genderVal) {
      genderVal = genderVal.charAt(0).toUpperCase() + genderVal.slice(1).toLowerCase();
  }

  try {
    const result = await pool.query(
      `UPDATE app_user
       SET fullname        = COALESCE(NULLIF($1, ''), fullname),
           email           = COALESCE(NULLIF($2, ''), email),
           dob             = COALESCE(NULLIF($3, '')::DATE, dob),
           gender          = COALESCE(NULLIF($4, ''), gender),
           qualification   = COALESCE(NULLIF($5, ''), qualification),
           language_level  = COALESCE(NULLIF($6, ''), language_level),
           experience      = COALESCE(NULLIF($7, ''), experience),
           modified_at     = CURRENT_TIMESTAMP
       WHERE phone = $8
       RETURNING user_id`,
      [
        fullname || null,
        email || null,
        dob || null,
        genderVal,
        qualification || null,
        language_level || null,
        experience || null,
        normalized,
      ],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ msg: "User not found" });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Sync receiveProfileUpdate error:", err);
    return res.status(500).json({ msg: "Sync failed" });
  }
}

// GET /api/sync/user/lookup?phone=XXXXXXXXXX
// Called by PHP to check if a Learner user exists before creating one
async function lookupUser(req, res) {
  const phone = req.query.phone;
  if (!phone) {
    return res.status(400).json({ msg: "Phone required" });
  }

  const normalized = normalizePhone(phone);

  try {
    const result = await pool.query(
      "SELECT user_id FROM app_user WHERE phone = $1 AND status = 1",
      [normalized],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ found: false });
    }

    return res
      .status(200)
      .json({ found: true, user_id: result.rows[0].user_id });
  } catch (err) {
    console.error("Sync lookupUser error:", err);
    return res.status(500).json({ msg: "Lookup failed" });
  }
}

module.exports = { receiveUserCreate, receiveProfileUpdate, lookupUser };
