const { rearg, result } = require("lodash");
const { pool } = require("../util/db");

async function getUserAnalytics(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const result = await pool.query(
      `
            SELECT *,COUNT(*) OVER() as total_count FROM user_analytics LIMIT $1 OFFSET $2
            `,
      [limit, offset]
    );
    const totalRecords =
      result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;
    const totalPages = Math.ceil(totalRecords / limit);

    res.status(200).json({
      data: result.rows,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalRecords: totalRecords,
        pageSize: limit,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching results from DB");
  }
}

async function refreshAnalytics(req, res) {
  try {
    const result = await pool.query(`
            REFRESH MATERIALIZED VIEW CONCURRENTLY user_analytics;
            `);
    res.status(200).json({ message: "view refreshed successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching results from DB");
  }
}

async function getNewUserAnalytics(req, res) {
  try {
    const result = await pool.query(`
     SELECT *
FROM new_user_analytics
      `);
    res.status(200).json({ count: result.rows.length, result: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching results from DB");
  }
}

async function getPreviousMonthFlashCardInteractions(req, res) {
  try {
    const result = await pool.query(`
      SELECT *
FROM prev_month_flash_card_interaction
      `);
    res.status(200).json({ count: result.rows.length, result: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching results from DB");
  }
}

async function getPreviousMonthUserCompletionRate(req, res) {
  try {
    const result = await pool.query(`
      SELECT * FROM flashcard_user_interaction_analytics LIMIT 10
      `);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching results from DB");
  }
}

async function getPreviousMonthTestCompletionRate(req, res) {
  try {
    const result = await pool.query(`
      SELECT * FROM flashcard_test_analytics
      `);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching results from DB");
  }
}

async function getTotalUsers(req, res) {
  try {
    const result = await pool.query(`SELECT count(*) as count FROM app_user`);
    res.status(200).json({ count: result.rows[0].count });
  } catch (err) {
    console.log(err);
    res.status(500).send("error fecthing results from db");
  }
}
module.exports = {
  getUserAnalytics,
  refreshAnalytics,
  getPreviousMonthFlashCardInteractions,
  getPreviousMonthTestCompletionRate,
  getPreviousMonthUserCompletionRate,
  getNewUserAnalytics,
  getTotalUsers,
};
