const { rearg, result } = require("lodash");
const { pool } = require("../util/db");

async function getUserAnalytics(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const result = await pool.query(
      `
            WITH user_completion AS (
              SELECT 
                *,
                CASE 
                  WHEN jsonb_array_length(COALESCE(jsonb_agg, '[]'::jsonb)) = 0 THEN 0
                  ELSE (
                    (SELECT COUNT(*) FROM jsonb_array_elements(jsonb_agg) WHERE (value->>'test_status')::boolean = true)::numeric / 
                    NULLIF(jsonb_array_length(jsonb_agg), 0) * 100
                  )
                END as completion_rate
              FROM user_analytics
            )
            SELECT *, COUNT(*) OVER() as total_count 
            FROM user_completion
            ORDER BY completion_rate DESC
            LIMIT $1 OFFSET $2
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
      SELECT * FROM flashcard_user_interaction_analytics ORDER BY submission_count DESC LIMIT 10
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
      SELECT * FROM flashcard_test_analytics ORDER BY count DESC LIMIT 10
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

async function getStoryAnalytics(req, res) {
  try {
    const result = await pool.query(
      `SELECT * FROM story_analytics ORDER BY total_readers DESC`
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.log("Error in getting story analytics: ", error.message);
    res.status(500).send("Error in fetching story analytics");
  }
}

async function getPronounceAnalytics(req, res) {
  try {
    const result = await pool.query(
      `SELECT * FROM pronounce_analytics ORDER BY total_users DESC`
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.log("Error in getting pronounce analytics: ", error.message);
    res.status(500).send("Error in fetching pronounce analytics");
  }
}

async function getConversationAnalytics(req, res) {
  try {
    const result = await pool.query(
      `SELECT * FROM conversation_analytics ORDER BY total_listeners DESC`
    );

    res.status(200).json(result.rows);
  } catch (error) {
    console.log("Error in getting conversation analytics: ", error.message);
    res.status(500).send("Error in fetching conversation analytics");
  }
}

async function getUserDetailedHistory(req, res) {
  const { user_id } = req.params;

  try {
    const result = await pool.query(
      `SELECT 
        'flashcard' as activity_type,
        ucs.set_id as item_id,
        fcs.set_name as item_name,
        fcs.proficiency_level,
        ucs.test_status as completed,
        ucs.current_index,
        ucs.current_order,
        NULL as last_accessed
      FROM user_chapter_submissions ucs
      JOIN flash_card_set fcs ON ucs.set_id = fcs.set_id
      WHERE ucs.user_id = $1
      UNION ALL
      SELECT 
        'pronounce' as activity_type,
        upp.pronounce_id as item_id,
        pcs.pronounce_name as item_name,
        pcs.proficiency_level,
        upp.completed,
        upp.current_card_index as current_index,
        NULL as current_order,
        upp.last_accessed
      FROM user_pronounce_progress upp
      JOIN pronounce_card_set pcs ON upp.pronounce_id = pcs.pronounce_id
      WHERE upp.user_id = $1
      UNION ALL
      SELECT 
        'conversation' as activity_type,
        ucp.conversation_id as item_id,
        c.title as item_name,
        c.proficiency_level,
        ucp.completed,
        ucp.current_sentence as current_index,
        NULL as current_order,
        ucp.last_accessed
      FROM user_conversation_progress ucp
      JOIN conversation c ON ucp.conversation_id = c.conversation_id
      WHERE ucp.user_id = $1
      UNION ALL
      SELECT 
        'story' as activity_type,
        usp.story_id as item_id,
        s.title as item_name,
        'A1' as proficiency_level,
        usp.completed,
        NULL as current_index,
        NULL as current_order,
        usp.completed_at as last_accessed
      FROM user_story_progress usp
      JOIN story s ON usp.story_id = s.story_id
      WHERE usp.user_id = $1
      ORDER BY last_accessed DESC NULLS LAST
    `,
      [user_id]
    );

    res.status(200).json(result.rows);
  } catch (error) {
    console.log("Error in getting user history details: ", error.message);
    res.status(500).send("Error in fetching user history");
  }
}

async function getRecentActivity(req, res) {
  const { timeframe } = req.query;

  try {
    let hoursAgo;
    switch (timeframe) {
      case "24h":
        hoursAgo = 24;
        break;
      case "7d":
        hoursAgo = 168;
        break;
      case "30d":
        hoursAgo = 720;
        break;
      default:
        hoursAgo = 24;
    }
    const result = await pool.query(
      `
      --FlashCards
      SELECT 
        'Flashcard Test' as activity_type,
        u.username,
        u.user_id,
        fcs.set_name as item_name,
        fcs.proficiency_level,
        ucs.modified_at as completed_at
      FROM user_chapter_submissions ucs
      JOIN app_user u ON ucs.user_id = u.user_id
      JOIN flash_card_set fcs ON ucs.set_id = fcs.set_id
      WHERE ucs.test_status = true
        AND ucs.modified_at >= NOW() - INTERVAL '1 hour' * $1
      
      UNION ALL
      
      --PronounceCards
      SELECT 
        'Pronounce Set' as activity_type,
        u.username,
        u.user_id,
        pcs.pronounce_name as item_name,
        pcs.proficiency_level,
        upp.last_accessed as completed_at
      FROM user_pronounce_progress upp
      JOIN app_user u ON upp.user_id = u.user_id
      JOIN pronounce_card_set pcs ON upp.pronounce_id = pcs.pronounce_id
      WHERE upp.completed = true
        AND upp.last_accessed >= NOW() - INTERVAL '1 hour' * $1
      
      UNION ALL
      
      --ConversationsCompletions
      SELECT 
        'Conversation' as activity_type,
        u.username,
        u.user_id,
        c.title as item_name,
        c.proficiency_level,
        ucp.last_accessed as completed_at
      FROM user_conversation_progress ucp
      JOIN app_user u ON ucp.user_id = u.user_id
      JOIN conversation c ON ucp.conversation_id = c.conversation_id
      WHERE ucp.completed = true
        AND ucp.last_accessed >= NOW() - INTERVAL '1 hour' * $1
      
      UNION ALL
      
      --StoryCompletions
      SELECT 
        'Story' as activity_type,
        u.username,
        u.user_id,
        s.title as item_name,
        'A1' as proficiency_level,
        usp.completed_at
      FROM user_story_progress usp
      JOIN app_user u ON usp.user_id = u.user_id
      JOIN story s ON usp.story_id = s.story_id
      WHERE usp.completed = true
        AND usp.completed_at >= NOW() - INTERVAL '1 hour' * $1
      
      ORDER BY completed_at DESC
      LIMIT 100
      `,
      [hoursAgo]
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.log("Error in getting recent activity: ", error.message);
    res.status(500).send("Error in fetching recent activity");
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
  getStoryAnalytics,
  getPronounceAnalytics,
  getConversationAnalytics,
  getUserDetailedHistory,
  getRecentActivity,
};
