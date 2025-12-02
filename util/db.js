// Import the PostgreSQL client
const { Pool } = require("pg");
const db_config = require("../config/configuration");
const queries = require("../model/schema");

const pool = new Pool({
  connectionString: db_config.db_config.connection_string,
  ssl: {
    rejectUnauthorized: false,
  },
  max: 20,
  min: 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on("error", (err, client) => {
  console.error("Unexpected error on idle client", err);
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
    await pool.query(queries.createResume);
    await pool.query(queries.createConversation);
    await pool.query(queries.createConversationSentence);
    await pool.query(queries.createUserConversationProgress);

    console.log("Tables created or already exist!");
  } catch (err) {
    console.error(`Error occurred while creating tables: ${err}`);
  }
}

module.exports = { pool, initDb };
