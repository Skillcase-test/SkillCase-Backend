const fs = require("fs");
const path = require("path");
const {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
} = require("@aws-sdk/client-transcribe-streaming");
const stringSimilarity = require("string-similarity");
const ffmpegPath = require("ffmpeg-static");
const ffmpeg = require("fluent-ffmpeg");
ffmpeg.setFfmpegPath(ffmpegPath);
const stream = require("stream");
const csv = require("csv-parser");
const { pool } = require("../util/db");

const {
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  AWS_REGION,
} = require("../config/configuration");

async function asses(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: "no file uploaded" });
  }

  const audioPath = req.file.path;
  const convertedPath = audioPath + ".pcm";

  try {
    const { reference_text, language = "de-DE" } = req.body;

    // Validate input
    if (!reference_text || reference_text.trim().length === 0) {
      if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
      return res.status(400).json({ error: "reference text required" });
    }

    // Convert audio to PCM 16kHz Mono using FFmpeg
    // Note: ffmpeg reads the WAV header for input sample rate automatically.
    // We force resample to 16000Hz, which is required by AWS Transcribe Streaming.
    await new Promise((resolve, reject) => {
      ffmpeg(audioPath)
        .inputOption("-f wav") // explicitly tell ffmpeg input format
        .outputOptions(["-f s16le", "-acodec pcm_s16le", "-ac 1", "-ar 16000"])
        .on("error", (err) => {
          console.error("FFmpeg conversion error:", err);
          reject(err);
        })
        .on("end", () => {
          const size = fs.existsSync(convertedPath)
            ? fs.statSync(convertedPath).size
            : -1;
          resolve();
        })
        .save(convertedPath);
    });

    const transcribeClient = new TranscribeStreamingClient({
      region: AWS_REGION,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
      },
    });

    const audioStream = async function* () {
      const stream = fs.createReadStream(convertedPath);
      const CHUNK_SIZE = 3200; // Small chunk size for streaming
      let buffer = Buffer.alloc(0);

      for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
        while (buffer.length >= CHUNK_SIZE) {
          yield { AudioEvent: { AudioChunk: buffer.subarray(0, CHUNK_SIZE) } };
          buffer = buffer.subarray(CHUNK_SIZE);
        }
      }
      if (buffer.length > 0) {
        yield { AudioEvent: { AudioChunk: buffer } };
      }
    };

    const command = new StartStreamTranscriptionCommand({
      LanguageCode: language,
      MediaSampleRateHertz: 16000,
      MediaEncoding: "pcm",
      AudioStream: audioStream(),
    });

    const response = await transcribeClient.send(command);

    let recognizedText = "";
    for await (const event of response.TranscriptResultStream) {
      if (event.TranscriptEvent) {
        const results = event.TranscriptEvent.Transcript.Results;
        if (results.length > 0) {
          if (!results[0].IsPartial) {
            recognizedText += results[0].Alternatives[0].Transcript + " ";
          }
        }
      } else if (event.BadRequestException) {
        console.error(
          "[Pronounce] AWS BadRequestException:",
          event.BadRequestException,
        );
      } else if (event.InternalFailureException) {
        console.error(
          "[Pronounce] AWS InternalFailureException:",
          event.InternalFailureException,
        );
      } else {
      }
    }

    recognizedText = recognizedText.trim();

    if (!recognizedText) {
      // AWS Transcribe returned no speech — treat as 0 score, NOT a 400 error.
      // This happens when the audio is too quiet, too short, or not in the language.
      if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
      if (fs.existsSync(convertedPath)) fs.unlinkSync(convertedPath);
      return res.json({
        message: "Pronunciation assessment completed successfully.",
        result: {
          recognizedText: "",
          accuracyScore: 0,
          fluencyScore: 0,
          completenessScore: 0,
          pronunciationScore: 0,
        },
      });
    }

    // Calculate accuracy score using string similarity
    const similarity = stringSimilarity.compareTwoStrings(
      recognizedText.toLowerCase(),
      reference_text.toLowerCase(),
    );
    const accuracyScore = Math.round(similarity * 100);

    const finalResult = {
      recognizedText: recognizedText,
      accuracyScore: accuracyScore,
      fluencyScore: accuracyScore, // AWS Transcribe doesn't provide fluency, mapping to accuracy
      completenessScore: accuracyScore, // AWS Transcribe doesn't provide completeness, mapping to accuracy
      pronunciationScore: accuracyScore,
    };

    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    if (fs.existsSync(convertedPath)) fs.unlinkSync(convertedPath);

    return res.json({
      message: "Pronunciation assessment completed successfully.",
      result: finalResult,
    });
  } catch (err) {
    console.error("Error in assessment:", err);
    if (fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
    }
    if (fs.existsSync(convertedPath)) {
      fs.unlinkSync(convertedPath);
    }
    return res.status(500).json({
      error: "Failed to process audio",
      details: err.message,
    });
  }
}

async function addPronounceSet(req, res) {
  if (!req.file) {
    return res.status(400).send("No file uploaded");
  }

  const { pronounce_name, proficiency_level } = req.body;

  const results = [];

  const bufferStream = new stream.PassThrough();
  bufferStream.end(req.file.buffer);

  bufferStream
    .pipe(csv({ mapHeaders: ({ header }) => header.trim() }))
    .on("data", (row) => {
      if (
        row.front_content &&
        row.front_content.trim() &&
        row.back_content &&
        row.back_content.trim()
      ) {
        results.push(row);
      }
    })
    .on("end", async () => {
      if (results.length === 0) {
        return res.status(400).json({
          error:
            "No valid cards found in CSV. Ensure each row has front_content and back_content.",
        });
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const setInsert = await client.query(
          `INSERT INTO pronounce_card_set (pronounce_name, language, proficiency_level, number_of_cards)
           VALUES ($1, 'German', $2, $3)
           RETURNING pronounce_id`,
          [pronounce_name, proficiency_level, results.length],
        );

        if (!setInsert.rows || setInsert.rows.length === 0) {
          throw new Error("Failed to insert set");
        }
        const pronounce_id = setInsert.rows[0].pronounce_id;

        const cardRows = results.map((row) => [
          pronounce_id,
          row.front_content.trim(),
          row.back_content.trim(),
        ]);

        const values = [];
        const placeholders = [];

        cardRows.forEach((row, i) => {
          const baseIndex = i * 3;
          placeholders.push(
            `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3})`,
          );
          values.push(...row);
        });

        const insertQuery = `
          INSERT INTO pronounce_card (pronounce_id, front_content, back_content)
          VALUES ${placeholders.join(",")}
        `;

        await client.query(insertQuery, values);

        await client.query("COMMIT");

        res.json({
          message: "Set and cards uploaded successfully",
          pronounce_id,
          cardsInserted: cardRows.length,
        });
      } catch (err) {
        await client.query("ROLLBACK");
        console.error("Transaction error:", err);
        res.status(500).json({
          error: "Error adding pronunciation set",
          details: err.message,
        });
      } finally {
        client.release();
      }
    })
    .on("error", (err) => {
      console.error("Error parsing CSV:", err);
      res.status(500).send("Error parsing CSV");
    });
}

async function deletePronounceSet(req, res) {
  const { pronounce_name, proficiency_level } = req.body;

  if (!pronounce_name || !proficiency_level)
    return res
      .status(400)
      .json({ msg: "set_name or proficiency_level not found" });
  try {
    await pool.query(
      "DELETE FROM pronounce_card_set where pronounce_name = $1 AND proficiency_level= $2 AND language ='German'",
      [pronounce_name, proficiency_level],
    );
    res.status(200).json({ message: "deleted chapter successfully" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "couldn't delete the chapter" });
  }
}

async function getPronounceCards(req, res) {
  const pronounce_id = req.params.pronounce_id;

  if (!pronounce_id) {
    return res.status(400).send("No Chapter was selected");
  }

  try {
    const result = await pool.query(
      "SELECT * FROM pronounce_card WHERE pronounce_id = $1",
      [pronounce_id],
    );

    res.status(200).json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Couldn't fetch flash cards");
  }
}

async function getPronounceSetByProf(req, res) {
  const proficiency_level = req.params.prof_level;
  const { user_id } = req.user;

  try {
    const result = await pool.query(
      `SELECT 
      f.pronounce_id,
      f.pronounce_name,
      f.language,
      f.proficiency_level,
      f.number_of_cards,
      COALESCE(upp.completed, false) as completed,
      COALESCE(upp.current_card_index, 0) as current_card_index,
      upp.last_accessed
      FROM pronounce_card_set f LEFT JOIN user_pronounce_progress upp ON f.pronounce_id = upp.pronounce_id AND upp.user_id=$1 WHERE f.proficiency_level = $2 ORDER BY f.pronounce_name`,
      [user_id, proficiency_level],
    );

    res.status(200).json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching results from DB");
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
      [user_id, set_id, status_fixed, order, current_index],
    );

    res.status(200).json({ msg: "ok" });
  } catch (err) {
    console.log("error saving user chapter state:", err);
    res.status(500).json({ msg: "error saving user chapter state" });
  }
}

async function getUserPronounceProgress(req, res) {
  const { pronounce_id } = req.params;
  const { user_id } = req.user;

  try {
    const result = await pool.query(
      `SELECT * FROM user_pronounce_progress WHERE user_id=$1 AND pronounce_id=$2
      `,
      [user_id, pronounce_id],
    );

    if (result.rows.length === 0) {
      return res.status(200).json({
        current_card_index: 0,
        completed: false,
      });
    }
    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.log("Error in fetching user pronounce progress:", error);
    res.status(500).json({ msg: "Error in fetching user pronounce progress" });
  }
}

async function saveUserPronounceProgress(req, res) {
  const { pronounce_id } = req.params;
  const { user_id } = req.user;
  const { current_card_index, completed } = req.body;
  if (current_card_index === undefined) {
    return res.status(400).json({ msg: "current_card_index is required!" });
  }
  try {
    await pool.query(
      `INSERT INTO user_pronounce_progress(user_id, pronounce_id, current_card_index, completed, last_accessed)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT(user_id, pronounce_id)
      DO UPDATE SET current_card_index=EXCLUDED.current_card_index,
      completed=EXCLUDED.completed,
      last_accessed=NOW()
      `,
      [user_id, pronounce_id, current_card_index, completed || false],
    );
    res.status(200).json({ msg: "Progress saved successfully!" });
  } catch (error) {
    console.log("Error in saving user pronounce progress: ", error);
    res.status(500).json({ msg: "Error in saving user pronounce progress" });
  }
}

module.exports = {
  asses,
  addPronounceSet,
  deletePronounceSet,
  getPronounceCards,
  getPronounceSetByProf,
  getUserPronounceProgress,
  saveUserPronounceProgress,
};
