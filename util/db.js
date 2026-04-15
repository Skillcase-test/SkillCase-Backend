const { Pool } = require("pg");
const db_config = require("../config/configuration");
const queries = require("../model/schema");

const poolOptions = db_config.db_config.pool || {};

const pool = new Pool({
  connectionString: db_config.db_config.connection_string,
  ssl: db_config.db_config.ssl,
  max: poolOptions.max,
  min: poolOptions.min,
  idleTimeoutMillis: poolOptions.idleTimeoutMillis,
  connectionTimeoutMillis: poolOptions.connectionTimeoutMillis,
  allowExitOnIdle: poolOptions.allowExitOnIdle,
  keepAlive: poolOptions.keepAlive,
  keepAliveInitialDelayMillis: poolOptions.keepAliveInitialDelayMillis,
  maxUses: poolOptions.maxUses,
});

pool.on("error", (err, client) => {
  console.error("Unexpected error on idle client", err);
});

pool.on("connect", () => {
  console.log("[DB] New client connected");
});

pool.on("acquire", () => {
  if (pool.waitingCount > 0) {
    console.warn(
      `[DB] Pool pressure: waiting=${pool.waitingCount} total=${pool.totalCount} idle=${pool.idleCount}`,
    );
  }
});

pool.on("remove", () => {
  console.log("[DB] Client removed from pool");
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
    await pool.query(queries.createUserPronounceProgress);
    await pool.query(queries.createUserStoryProgress);
    await pool.query(queries.createStoryAnalyticsView);
    await pool.query(queries.createPronounceAnalyticsView);
    await pool.query(queries.createConversationAnalyticsView);
    await pool.query(queries.createConversationTimestamp);
    await pool.query(queries.createUserDailyActivity);
    await pool.query(queries.createUserStreak);
    await pool.query(queries.createUserFlippedCards);
    await pool.query(queries.createLeads);
    await pool.query(queries.createScheduledMessages);
    await pool.query(queries.alterAppUser);
    await pool.query(queries.createUserOtp);
    await pool.query(queries.createNotificationAnalytics);
    await pool.query(queries.createOtaUpdateLog);
    await pool.query(queries.createEvent);
    await pool.query(queries.createEventRegistration);
    await pool.query(queries.createEventSubscription);
    await pool.query(queries.alterTable);
    await pool.query(queries.createEventOverride);
    await pool.query(queries.createA2Tables);
    await pool.query(queries.createLpDemoClass);
    await pool.query(queries.createLpSalaryInfo);
    await pool.query(queries.createLpTalkToTeam);
    await pool.query(queries.seedLandingPageDefaults);
    await pool.query(queries.createNewsTables);

    //Test
    await pool.query(queries.createHardcoreTestTables);

    // Interview
    await pool.query(queries.createInterviewToolTables);

    // Wise
    await pool.query(queries.createWiseTranscripts);

    // A1 revamp
    await pool.query(queries.createA1Tables);

    console.log("Tables created or already exist!");
  } catch (err) {
    console.error(`Error occurred while creating tables: ${err}`);
    throw err;
  }
}

module.exports = { pool, initDb };
