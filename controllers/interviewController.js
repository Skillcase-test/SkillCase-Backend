const { pool } = require("../util/db");

async function getInterview(req, res) {
  const { prof_level } = req.params;

  if (!prof_level) {
    return res.status(400).json({ message: "no proficiency level provided" });
  }

  try {
    const qResult = await pool.query(
      `SELECT * FROM interview WHERE proficiency_level = $1`,
      [prof_level]
    );

    res.status(200).json({
      data: qResult.rows,
      message: "results fetched successfully",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "could not fetch tests from db" });
  }
}

async function createInterview(req, res) {
  const { prof_level, link, difficulty } = req.body;

  if (!prof_level || !link || !difficulty) {
    return res
      .status(400)
      .json({
        message: "type, proficiency level, link, or difficulty  missing",
      });
  }

  try {
    await pool.query(
      `
  INSERT INTO interview (proficiency_level, difficulty, interview_link)
  VALUES ($1, $2, $3)
  ON CONFLICT (proficiency_level, difficulty)
  DO UPDATE SET interview_link = EXCLUDED.interview_link
`,
      [prof_level, difficulty, link]
    );

    res.status(200).json({ message: "test added successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "could not create test" });
  }
}

async function deleteInterview(req, res) {
  const { interview_id } = req.body;

  if (!interview_id) {
    return res
      .status(400)
      .json({ message: "The interview id to be deleted is missing" });
  }

  try {
    await pool.query(
      `
      DELETE from interview
      WHERE interview_id = $1;
      `,
      [interview_id]
    );

    res.status(200).json({ message: "the interview was deleted successfully" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "the interview could not be deleted" });
  }
}

module.exports = { getInterview, createInterview, deleteInterview };
