const { result } = require("lodash");
const { pool } = require("../util/db");
const e = require("express");

// GET FLASH SETS BY LANGUAGE
async function getFlashSetByProf(req, res) {
  const proficiency_level = req.params.prof_level;
  const user = req.user;

  try {
    const result = await pool.query(
      `SELECT f.*,u.user_id,u.test_status,u.last_reviewed,u.created_at,u.modified_at  
       FROM flash_card_set f
       LEFT JOIN user_chapter_submissions u
       ON f.set_id = u.set_id AND u.user_id = $1
       WHERE f.proficiency_level = $2
       ORDER BY set_name`,
      [user.user_id, proficiency_level]
    );

    res.status(200).json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching results from DB");
  }
}
async function getFlahsCards(req, res) {
  const set_id = req.params.set_id;

  if (!set_id) {
    return res.status(400).send("No Chapter was selected");
  }

  try {
    const result = await pool.query(
      "SELECT * FROM card WHERE set_id = $1 order by set_id asc",
      [set_id]
    );

    res.status(200).json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Couldn't fetch flash cards");
  }
}

async function saveUserChapterState(req, res) {
  if (!req.user)
    return res.status(400).json({ msg: "no authenticated user provided" });
  const { user_id, set_id, status, order, current_index } = req.body;
  if (!user_id) {
    return res.status(400).json({ msg: "user_id not found" });
  }
  if (!set_id) {
    return res.status(400).json({ msg: "set_id not found" });
  }
  if (status === undefined) {
    return res.status(400).json({ msg: "status not found" });
  }
  if (!order) {
    return res.status(400).json({ msg: "order not found" });
  }
  if (current_index === undefined) {
    return res.status(400).json({ msg: "current_idx not found" });
  }

  var status_fixed;
  if (status === "null" || status === null || status === undefined) {
    status_fixed = false;
  } else {
    status_fixed = status;
  }
  try {
    const results = await pool.query(
      `
      INSERT INTO user_chapter_submissions (user_id, set_id, test_status,current_order,current_index,useDefault)
      VALUES ($1, $2, $3,$4,$5,FALSE)
      ON CONFLICT (user_id, set_id)
      DO UPDATE SET test_status = EXCLUDED.test_status
      ,current_order = EXCLUDED.current_order
      ,current_index = EXCLUDED.current_index
      ,useDefault = EXCLUDED.useDefault
      `,
      [user_id, set_id, status_fixed, order, current_index]
    );

    res.status(200).json({ msg: "ok" });
  } catch (err) {
    console.log("error saving user chapter state:", err);
    res.status(500).json({ msg: "error saving user chapter state" });
  }
}
async function getUserChapterState(req, res) {
  if (!req.user)
    return res.status(400).json({ msg: "no authenticated user provided" });
  user_id = req.user.user_id;
  set_id = req.params.set_id;
  if (!user_id || !set_id) {
    return res.status(400).json({ msg: "Missing required fields" });
  }
  try {
    const results = await pool.query(
      `
     SELECT * FROM user_chapter_submissions
     where user_id=$1 and set_id = $2
      `,
      [user_id, set_id]
    );

    if (results.rows.length === 0) {
      return res.status(200).json({ useDefault: true });
    }
    res.status(200).json(results.rows);
  } catch (err) {
    console.log("error saving user chapter state:", err);
    res.status(500).json({ msg: "error saving user chapter state" });
  }
}

module.exports = {
  getFlashSetByProf,
  getFlahsCards,
  saveUserChapterState,
  getUserChapterState,
};
