// Import the PostgreSQL client
const { Pool } = require("pg");
const db_config = require("../config/configuration");
const queries = require("../model/schema");

const pool = new Pool({
  connectionString: db_config.db_config.connection_string,
  ssl: {
    rejectUnauthorized: false,
  },
});

pool
  .connect()
  .then((client) => {
    console.log("Connected to PostgreSQL DB");
    client.release();
  })
  .catch((err) => console.error("DB connection failed:", err));

async function initDb(pool) {
  try {
    await pool.query(queries.createFlashCardSet);
    await pool.query(queries.createCards);
    await pool.query(queries.createUser);
    await pool.query(queries.createUserFlashSubmission);
    await pool.query(queries.createChTest);
    await pool.query(queries.createFinalTest);
    await pool.query(queries.createInterview);
    await pool.query(queries.createPronounceSet);
    await pool.query(queries.createPronounceCards);
    await pool.query(queries.createAgreement);
    await pool.query(queries.createStory);

    console.log("Tables created or already exist!");
  } catch (err) {
    console.error(`Error occurred while creating tables: ${err}`);
  }
}

module.exports = { pool, initDb };
