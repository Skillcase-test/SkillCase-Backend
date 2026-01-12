const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool } = require("../util/db");
const config = require("../config/configuration");
const { v4: uuidv4 } = require("uuid");

// SIGNUP
async function signup(req, res) {
  const { number, username, password, proficiency_level } = req.body;
  try {
    const result = await pool.query(
      "SELECT * FROM app_user WHERE number = $1",
      [number]
    );
    const rows = result.rows;

    if (rows.length > 0) {
      return res.status(400).json({ msg: "User already exists" });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: "Error while searching user" });
  }

  const hashed = await bcrypt.hash(password, 10);
  const newId = uuidv4();
  const role = "user";

  try {
    await pool.query(
      "INSERT INTO app_user (user_id, username, password, role,current_profeciency_level,number) VALUES ($1, $2, $3, $4,$5,$6)",
      [newId, username, hashed, role, proficiency_level, number]
    );

    const token = jwt.sign(
      {
        user_id: newId,
        username,
        role,
        user_prof_level: proficiency_level,
        onboarding_completed: false,
      },
      config.JWT_SECRET_KEY,
      { expiresIn: "60d" }
    );

    res.status(200).json({
      user: {
        user_id: newId,
        username,
        role,
        user_prof_level: proficiency_level,
        onboarding_completed: false,
      },
      token,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Error while trying to create account" });
  }
}

// LOGIN
async function login(req, res) {
  if (!req.body) {
    return res.status(400).json({ msg: "number or password missing" });
  }

  const { number, password } = req.body;

  try {
    const result = await pool.query(
      "SELECT * FROM app_user WHERE number = $1",
      [number]
    );
    const rows = result.rows;

    if (rows.length === 0) {
      return res.status(400).json({ msg: "Invalid number or password" });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ msg: "Invalid number or password" });
    }

    const token = jwt.sign(
      {
        user_id: user.user_id,
        username: user.username,
        role: user.role,
        user_prof_level: user.current_profeciency_level,
        onboarding_completed: user.onboarding_completed,
      },
      config.JWT_SECRET_KEY,
      { expiresIn: "60d" }
    );

    res.status(200).json({
      user: {
        user_id: user.user_id,
        username: user.username,
        role: user.role,
        user_prof_level: user.current_profeciency_level,
        onboarding_completed: user.onboarding_completed,
      },
      token,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: "Error while searching user" });
  }
}

// ME
async function me(req, res) {
  if (!req.user) {
    return res.status(401).json({ msg: "Unauthorized: no user logged in" });
  }

  const { user_id } = req.user;

  try {
    const result = await pool.query(
      "SELECT * FROM app_user WHERE user_id = $1",
      [user_id]
    );
    const rows = result.rows;

    if (rows.length === 0) {
      return res.status(404).json({ msg: "User not found" });
    }

    const user = rows[0];

    res.status(200).json({
      user: {
        user_id: user.user_id,
        username: user.username,
        role: user.role,
        onboarding_completed: user.onboarding_completed,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send("Error while accessing DB");
  }
}

//save firebase token for notifications
const saveFcmToken = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { fcmToken } = req.body;

    await pool.query("UPDATE app_user SET fcm_token = $1 WHERE user_id = $2", [
      fcmToken,
      userId,
    ]);

    res.json({ success: true });
  } catch (error) {
    console.error("Error saving FCM token:", error);
    res.status(500).json({ error: "Failed to save FCM token" });
  }
};

async function updateUserActivity(req, res) {
  try {
    const userId = req.user?.user_id;
    const { appVersion } = req.body;

    if (!userId) {
      return res.status(401).json({ msg: "Unauthorized" });
    }

    // Update last_activity_at and optionally app_version
    if (appVersion) {
      await pool.query(
        `UPDATE app_user 
         SET last_activity_at = NOW(), app_version = $2
         WHERE user_id = $1`,
        [userId, appVersion]
      );
    } else {
      await pool.query(
        `UPDATE app_user 
         SET last_activity_at = NOW() 
         WHERE user_id = $1`,
        [userId]
      );
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error updating user activity:", error);
    res.status(500).json({ error: "Failed to update activity" });
  }
}

async function updateAppVersion(req, res) {
  try {
    const userId = req.user?.user_id;
    const { appVersion } = req.body;

    if (!userId || !appVersion) {
      return res.status(400).json({ msg: "Missing required fields" });
    }

    await pool.query(
      `UPDATE app_user SET app_version = $1 WHERE user_id = $2`,
      [appVersion, userId]
    );

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error updating app version:", error);
    res.status(500).json({ error: "Failed to update version" });
  }
}

async function completeOnboarding(req, res) {
  try {
    const userId = req.user?.user_id;

    if (!userId) {
      return res.status(401).json({ msg: "Unauthorized" });
    }

    await pool.query(
      `UPDATE app_user 
       SET onboarding_completed = TRUE 
       WHERE user_id = $1`,
      [userId]
    );

    res.status(200).json({ success: true, message: "Onboarding completed" });
  } catch (error) {
    console.error("Error completing onboarding:", error);
    res.status(500).json({ error: "Failed to complete onboarding" });
  }
}

// GET Article Education Status
async function getArticleEducation(req, res) {
  const { user_id } = req.user;

  try {
    const result = await pool.query(
      "SELECT article_education_complete FROM app_user WHERE user_id = $1",
      [user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ msg: "User not found" });
    }

    res.status(200).json({
      complete: result.rows[0].article_education_complete || false,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Error fetching article education status" });
  }
}

// POST Mark Article Education Complete
async function completeArticleEducation(req, res) {
  const { user_id } = req.user;

  try {
    await pool.query(
      "UPDATE app_user SET article_education_complete = TRUE WHERE user_id = $1",
      [user_id]
    );
    res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Error updating article education status" });
  }
}

module.exports = {
  login,
  signup,
  me,
  saveFcmToken,
  completeOnboarding,
  updateUserActivity,
  updateAppVersion,
  getArticleEducation,
  completeArticleEducation,
};
