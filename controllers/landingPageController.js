const { pool } = require("../util/db");
const cloudinary = require("../config/cloudinary");

// Public: get all three sections for a specific level
const getSectionsByLevel = async (req, res) => {
  const { level } = req.params;
  if (!["A1", "A2"].includes(level)) {
    return res
      .status(400)
      .json({ message: "Invalid level. Must be A1 or A2." });
  }
  try {
    const [demo, salary, talk] = await Promise.all([
      pool.query("SELECT * FROM lp_demo_class WHERE level = $1", [level]),
      pool.query("SELECT * FROM lp_salary_info WHERE level = $1", [level]),
      pool.query("SELECT * FROM lp_talk_to_team WHERE level = $1", [level]),
    ]);
    return res.status(200).json({
      demo_class: demo.rows[0] || null,
      salary_info: salary.rows[0] || null,
      talk_to_team: talk.rows[0] || null,
    });
  } catch (error) {
    console.error("getSectionsByLevel error:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Admin: update demo_class for a level
const updateDemoClass = async (req, res) => {
  const { level } = req.params;
  const {
    heading,
    subtitle,
    check_item_1,
    check_item_2,
    button_text,
    button_link,
    badge_text,
    image_url,
  } = req.body;
  try {
    const result = await pool.query(
      `UPDATE lp_demo_class SET
        heading = COALESCE($1, heading),
        subtitle = COALESCE($2, subtitle),
        check_item_1 = COALESCE($3, check_item_1),
        check_item_2 = COALESCE($4, check_item_2),
        button_text = COALESCE($5, button_text),
        button_link = COALESCE($6, button_link),
        badge_text = COALESCE($7, badge_text),
        image_url = COALESCE($8, image_url),
        updated_at = CURRENT_TIMESTAMP
      WHERE level = $9 RETURNING *`,
      [
        heading,
        subtitle,
        check_item_1,
        check_item_2,
        button_text,
        button_link,
        badge_text,
        image_url,
        level,
      ],
    );
    if (result.rows.length === 0)
      return res.status(404).json({ message: "Level not found" });
    return res.status(200).json({ message: "Updated", data: result.rows[0] });
  } catch (error) {
    console.error("updateDemoClass error:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Admin: update salary_info for a level
const updateSalaryInfo = async (req, res) => {
  const { level } = req.params;
  const {
    heading,
    subtitle,
    benefit_1,
    benefit_2,
    benefit_3,
    benefit_4,
    button_text,
    button_link,
    image_url,
  } = req.body;
  try {
    const result = await pool.query(
      `UPDATE lp_salary_info SET
        heading = COALESCE($1, heading),
        subtitle = COALESCE($2, subtitle),
        benefit_1 = COALESCE($3, benefit_1),
        benefit_2 = COALESCE($4, benefit_2),
        benefit_3 = COALESCE($5, benefit_3),
        benefit_4 = COALESCE($6, benefit_4),
        button_text = COALESCE($7, button_text),
        button_link = COALESCE($8, button_link),
        image_url = COALESCE($9, image_url),
        updated_at = CURRENT_TIMESTAMP
      WHERE level = $10 RETURNING *`,
      [
        heading,
        subtitle,
        benefit_1,
        benefit_2,
        benefit_3,
        benefit_4,
        button_text,
        button_link,
        image_url,
        level,
      ],
    );
    if (result.rows.length === 0)
      return res.status(404).json({ message: "Level not found" });
    return res.status(200).json({ message: "Updated", data: result.rows[0] });
  } catch (error) {
    console.error("updateSalaryInfo error:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Admin: update talk_to_team for a level
const updateTalkToTeam = async (req, res) => {
  const { level } = req.params;
  const {
    heading,
    feature_1,
    feature_2,
    feature_3,
    button_text,
    phone_link,
    phone_display_text,
    badge_text,
    avatar_image_url,
  } = req.body;
  try {
    const result = await pool.query(
      `UPDATE lp_talk_to_team SET
        heading = COALESCE($1, heading),
        feature_1 = COALESCE($2, feature_1),
        feature_2 = COALESCE($3, feature_2),
        feature_3 = COALESCE($4, feature_3),
        button_text = COALESCE($5, button_text),
        phone_link = COALESCE($6, phone_link),
        phone_display_text = COALESCE($7, phone_display_text),
        badge_text = COALESCE($8, badge_text),
        avatar_image_url = COALESCE($9, avatar_image_url),
        updated_at = CURRENT_TIMESTAMP
      WHERE level = $10 RETURNING *`,
      [
        heading,
        feature_1,
        feature_2,
        feature_3,
        button_text,
        phone_link,
        phone_display_text,
        badge_text,
        avatar_image_url,
        level,
      ],
    );
    if (result.rows.length === 0)
      return res.status(404).json({ message: "Level not found" });
    return res.status(200).json({ message: "Updated", data: result.rows[0] });
  } catch (error) {
    console.error("updateTalkToTeam error:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Admin: upload image to Cloudinary, write URL back to the correct table + level
const uploadSectionImage = async (req, res) => {
  const { section, level } = req.params;
  const tableMap = {
    demo_class: { table: "lp_demo_class", col: "image_url" },
    salary_info: { table: "lp_salary_info", col: "image_url" },
    talk_to_team: { table: "lp_talk_to_team", col: "avatar_image_url" },
  };
  const target = tableMap[section];
  if (!target) return res.status(400).json({ error: "Unknown section" });
  if (!["A1", "A2"].includes(level))
    return res.status(400).json({ error: "Invalid level" });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  try {
    const upload = await cloudinary.uploader.upload(req.file.path, {
      folder: `skillcase/landing-page/${level}`,
      transformation: [{ quality: "auto", fetch_format: "auto" }],
    });
    await pool.query(
      `UPDATE ${target.table} SET ${target.col} = $1, updated_at = CURRENT_TIMESTAMP WHERE level = $2`,
      [upload.secure_url, level],
    );
    return res.status(200).json({ success: true, url: upload.secure_url });
  } catch (error) {
    console.error("uploadSectionImage error:", error.message);
    return res.status(500).json({ error: "Upload failed" });
  }
};

module.exports = {
  getSectionsByLevel,
  updateDemoClass,
  updateSalaryInfo,
  updateTalkToTeam,
  uploadSectionImage,
};
