const fs = require("fs");
const sdk = require("microsoft-cognitiveservices-speech-sdk");
const stream = require("stream");
const csv = require("csv-parser");
const { pool } = require("../util/db");

const { SUBSCRIPTION_KEY, REGION } = require("../config/configuration");

async function asses(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: "no file uploaded" });
  }

  try {
    const { reference_text } = req.body;
    const audioPath = req.file.path;
    const audioBuffer = fs.readFileSync(audioPath);

    // Azure Speech Service setup
    const speechConfig = sdk.SpeechConfig.fromSubscription(
      SUBSCRIPTION_KEY,
      REGION
    );
    speechConfig.speechRecognitionLanguage = "de-DE"; // German language

    // Validate input
    if (!reference_text || reference_text.trim().length === 0) {
      return res.status(400).json({ error: "reference text required" });
    }

    // Audio and assessment config
    const audioConfig = sdk.AudioConfig.fromWavFileInput(audioBuffer);

    const pronunciationAssessmentConfig = new sdk.PronunciationAssessmentConfig(
      reference_text,
      sdk.PronunciationAssessmentGradingSystem.HundredMark,
      sdk.PronunciationAssessmentGranularity.Phoneme,
      true
    );

    // Disable prosody for non-English locales
    pronunciationAssessmentConfig.enableProsodyAssessment = false;

    // Create recognizer
    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
    pronunciationAssessmentConfig.applyTo(recognizer);

    // Single-shot recognition (preferred for assessment)
    recognizer.recognizeOnceAsync(
      (result) => {
        if (result.reason === sdk.ResultReason.RecognizedSpeech) {
          const assessment =
            sdk.PronunciationAssessmentResult.fromResult(result);

          const finalResult = {
            recognizedText: result.text,
            accuracyScore: assessment.accuracyScore,
            fluencyScore: assessment.fluencyScore,
            completenessScore: assessment.completenessScore,
            pronunciationScore: assessment.pronunciationScore,
          };

          console.log("German Pronunciation Assessment:", finalResult);

          fs.unlinkSync(audioPath);

          return res.json({
            message: "German pronunciation assessment completed successfully.",
            result: finalResult,
          });
        } else if (result.reason === sdk.ResultReason.NoMatch) {
          fs.unlinkSync(audioPath);
          return res.status(400).json({
            error: "No recognizable speech detected in the audio.",
          });
        }
      },
      (err) => {
        console.error("Recognition failed:", err);
        fs.unlinkSync(audioPath);
        return res
          .status(500)
          .json({ error: "Recognition failed", details: err });
      }
    );
  } catch (err) {
    console.error("Error in German assessment:", err);
    return res
      .status(500)
      .json({ error: "Failed to process German audio", details: err.message });
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
      // Only add rows that have both front_content and back_content
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
          [pronounce_name, proficiency_level, results.length]
        );

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
            `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3})`
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
      [pronounce_name, proficiency_level]
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
      [pronounce_id]
    );

    res.status(200).json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Couldn't fetch flash cards");
  }
}

async function getPronounceSetByProf(req, res) {
  const proficiency_level = req.params.prof_level;

  try {
    const result = await pool.query(
      `SELECT f.*
       FROM pronounce_card_set f
       WHERE f.proficiency_level = $1
       ORDER BY pronounce_name`,
      [proficiency_level]
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
      [user_id, set_id, status_fixed, order, current_index]
    );

    res.status(200).json({ msg: "ok" });
  } catch (err) {
    console.log("error saving user chapter state:", err);
    res.status(500).json({ msg: "error saving user chapter state" });
  }
}

module.exports = {
  asses,
  addPronounceSet,
  deletePronounceSet,
  getPronounceCards,
  getPronounceSetByProf,
};
