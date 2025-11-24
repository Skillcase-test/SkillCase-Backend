const { pool } = require("../util/db");

async function checkSetName(req, res) {
  const { set_name, proficiency_level } = req.body;

  if (!set_name || !proficiency_level)
    return res
      .status(400)
      .json({ msg: "chapter name or proficiency level missing" });

  try {
    const results = await pool.query(
      "SELECT * FROM flash_card_set WHERE set_name = $1 AND proficiency_level = $2",
      [set_name, proficiency_level]
    );
    const rows = results.rows;

    if (rows.length > 0)
      return res.status(200).json({ status: true, msg: "chapter name exists" });

    res.status(200).json({ status: false, msg: "chapter name doesn't exist" });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ msg: "couldn't query the db" });
  }
}

async function checkPronounceSetName(req, res) {
  const { pronounce_name, proficiency_level } = req.body;

  if (!pronounce_name || !proficiency_level)
    return res
      .status(400)
      .json({ msg: "chapter name or proficiency level missing" });

  try {
    const results = await pool.query(
      "SELECT * FROM pronounce_card_set WHERE pronounce_name = $1 AND proficiency_level = $2",
      [pronounce_name, proficiency_level]
    );
    const rows = results.rows;

    if (rows.length > 0)
      return res.status(200).json({ status: true, msg: "chapter name exists" });

    res.status(200).json({ status: false, msg: "chapter name doesn't exist" });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ msg: "couldn't query the db" });
  }
}

async function getChapters(req, res) {
  const proficiency_level = req.params.prof_level;
  const user = req.user;

  try {
    const result = await pool.query(
      `SELECT f.*
       FROM flash_card_set f
       WHERE f.proficiency_level = $1`,
      [proficiency_level]
    );

    res.status(200).json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching results from DB");
  }
}

async function getPronounceChapters(req, res) {
  const proficiency_level = req.params.prof_level;

  try {
    const result = await pool.query(
      `SELECT f.*
       FROM pronounce_card_set f
       WHERE f.proficiency_level = $1`,
      [proficiency_level]
    );

    res.status(200).json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching results from DB");
  }
}

module.exports = {
  checkSetName,
  getChapters,
  checkPronounceSetName,
  getPronounceChapters,
};
