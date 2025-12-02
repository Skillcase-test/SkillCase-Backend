const cloudinary = require("../config/cloudinary");
const { parseConversationJson } = require("../services/conversationService");
const { pool } = require("../util/db");

const createConversation = async (req, res) => {
  try {
    const { proficiency_level } = req.body;
    if (!req.files || !req.files.audio || !req.files.json) {
      return res.status(400).json({
        success: false,
        message: "Both audio and Json files are required!",
      });
    }

    const audioFile = req.files.audio[0];
    const jsonFile = req.files.json[0];

    const jsonContent = jsonFile.buffer.toString("utf-8");
    const conversationData = parseConversationJson(jsonContent);

    if (conversationData.proficiencyLevel !== proficiency_level) {
      return res.status(400).json({
        success: false,
        message: "Proficiency level mismatch between form and JSON",
      });
    }

    const audioUpload = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: "video",
          folder: "conversations",
          format: "mp3",
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      uploadStream.end(audioFile.buffer);
    });

    const conversationResult = await pool.query(
      `
      INSERT INTO conversation(title, topic, proficiency_level, audio_url, audio_duration, total_sentences)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING conversation_id
      `,
      [
        conversationData.title,
        conversationData.topic,
        conversationData.proficiencyLevel,
        audioUpload.secure_url,
        conversationData.audioDuration,
        conversationData.sentences.length,
      ]
    );

    const conversationId = conversationResult.rows[0].conversation_id;

    const sentenceInserts = conversationData.sentences.map((s) => {
      return pool.query(
        `
        INSERT INTO conversation_sentence (conversation_id, sentence_order, sentence_text, speaker, start_time, end_time)
        VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [conversationId, s.order, s.text, s.speaker, s.startTime, s.endTime]
      );
    });

    await Promise.all(sentenceInserts);

    res.status(201).json({
      success: true,
      message: "Conversation created successfully",
      data: {
        conversation_id: conversationId,
        title: conversationData.title,
      },
    });
  } catch (error) {
    console.log("Error in createConversation controller: ", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch conversations",
    });
  }
};

const deleteConversation = async (req, res) => {
  try {
    const { conversation_id } = req.params;

    const result = await pool.query(
      `DELETE FROM conversation WHERE conversation_id = $1 RETURNING *`,
      [conversation_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Conversation deleted successfully",
    });
  } catch (error) {
    console.log("Error in deleteConversation controller: ", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to delete conversation",
    });
  }
};

const getAllConversations = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM conversation ORDER BY proficiency_level, created_at DESC`
    );

    res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.log("Error in getAllConversations controller: ", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch conversations",
    });
  }
};

const getConversationsByLevel = async (req, res) => {
  try {
    const { prof_level } = req.params;
    const { user_id } = req.user;

    const result = await pool.query(
      `SELECT 
        c.conversation_id,
        c.title,
        c.topic,
        c.proficiency_level,
        c.total_sentences,
        c.audio_duration,
        COALESCE(ucp.completed, false) as completed,
        COALESCE(ucp.current_sentence, 0) as current_sentence
      FROM conversation c
      LEFT JOIN user_conversation_progress ucp 
        ON c.conversation_id = ucp.conversation_id AND ucp.user_id = $1
      WHERE c.proficiency_level = $2
      ORDER BY c.created_at DESC`,
      [user_id, prof_level]
    );

    res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.log("Error in getConversationsByLevel controller: ", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch conversation",
    });
  }
};

const getConversationById = async (req, res) => {
  try {
    const { conversation_id } = req.params;
    const { user_id } = req.user;

    const conversationResult = await pool.query(
      `SELECT * FROM conversation WHERE conversation_id = $1`,
      [conversation_id]
    );

    if (conversationResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    const sentencesResult = await pool.query(
      `SELECT * FROM conversation_sentence 
       WHERE conversation_id = $1 
       ORDER BY sentence_order ASC`,
      [conversation_id]
    );

    const progressResult = await pool.query(
      `INSERT INTO user_conversation_progress (user_id, conversation_id, last_accessed)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id, conversation_id) 
       DO UPDATE SET last_accessed = NOW()
       RETURNING *`,
      [user_id, conversation_id]
    );

    res.status(200).json({
      success: true,
      data: {
        conversation: conversationResult.rows[0],
        sentences: sentencesResult.rows,
        progress: progressResult.rows[0],
      },
    });
  } catch (error) {
    console.log("Error in getConversationById controller: ", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch conversation",
    });
  }
};

const updateProgress = async (req, res) => {
  try {
    const { conversation_id } = req.params;
    const { user_id } = req.user;
    const { current_sentence, last_sentence_completed, completed } = req.body;

    const result = await pool.query(
      `UPDATE user_conversation_progress 
       SET current_sentence = $1, 
           last_sentence_completed = $2,
           completed = $3,
           last_accessed = NOW()
       WHERE user_id = $4 AND conversation_id = $5
       RETURNING *`,
      [
        current_sentence,
        last_sentence_completed,
        completed,
        user_id,
        conversation_id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Progress record not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Progress updated successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.log("Error in updateProgress controller: ", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to update progress",
    });
  }
};

module.exports = {
  createConversation,
  deleteConversation,
  getAllConversations,
  getConversationsByLevel,
  getConversationById,
  updateProgress,
};
