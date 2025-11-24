const { pool } = require("../util/db");

async function getTest(req, res) {
  const { prof_level } = req.params;

  if (!prof_level) {
    return res.status(400).json({ message: "no proficiency level provided" });
  }

  try {
    const chapterResult = await pool.query(
      `SELECT * FROM chapter_test WHERE proficiency_level = $1`,
      [prof_level]
    );

    const FinalResult = await pool.query(
      `SELECT * FROM final_test WHERE proficiency_level = $1`,
      [prof_level]
    );

    res.status(200).json({
      results: {
        final: FinalResult.rows,
        chapter: chapterResult.rows,
      },
      message: "results fetched successfully",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "could not fetch tests from db" });
  }
}

async function createChTest(req, res) {
  const { prof_level, easy_link, medium_link, hard_link, test_name } = req.body;

  if (!easy_link || !prof_level || !medium_link || !test_name || !hard_link) {
    return res
      .status(400)
      .json({ message: "type, proficiency level, link, or test_name missing" });
  }

  try {
    await pool.query(
      `INSERT INTO chapter_test (proficiency_level, easy_test_link, medium_test_link, hard_test_link, test_name)
       VALUES ($1, $2, $3, $4,$5)
       ON CONFLICT (proficiency_level, test_name)
       DO UPDATE SET 
        easy_test_link = EXCLUDED.easy_test_link,
        medium_test_link = EXCLUDED.medium_test_link,
        hard_test_link = EXCLUDED.hard_test_link
        `,
      [prof_level, easy_link, medium_link, hard_link, test_name]
    );
    res.status(200).json({ message: "test added successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "could not create test" });
  }
}

async function deleteChTest(req, res) {
  const { test_id } = req.body;

  if (!test_id) {
    return res.status(400).json({ message: "test id is mising." });
  }

  try {
    await pool.query(
      `DELETE from chapter_test
      WHERE test_id=$1
        `,
      [test_id]
    );
    res.status(200).json({ message: "test deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "could not delete test with test_id" });
  }
}

async function deleteFinalTest(req, res) {
  const { test_id } = req.body;

  if (!test_id) {
    return res.status(400).json({ msg: "the test id is not present" });
  }

  try {
    await pool.query(
      `
      DELETE from final_test
      where test_id = $1;
      `,
      [test_id]
    );

    res
      .status(200)
      .json({
        message: "the final test with test_id " + test_id + "was deleted",
      });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "the final test could not be deleted" });
  }
}

async function createFinalTest(req, res) {
  const { prof_level, link, test_name } = req.body;

  if (!link || !prof_level || !test_name) {
    return res
      .status(400)
      .json({ message: "type, proficiency level, link, or test_name missing" });
  }

  try {
    await pool.query(
      `INSERT INTO final_test (proficiency_level, test_link, test_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (proficiency_level, test_name)
       DO UPDATE SET test_link = EXCLUDED.test_link
        `,
      [prof_level, link, test_name]
    );
    res.status(200).json({ message: "test added successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "could not create test" });
  }
}
module.exports = {
  getTest,
  createChTest,
  createFinalTest,
  deleteChTest,
  deleteFinalTest,
};
