const { pool } = require("../util/db");
const stream = require("stream");
const csv = require("csv-parser");

async function addFlashSet(req, res) {
  if (!req.file) {
    return res.status(400).send("No file uploaded");
  }

  const { set_name, proficiency_level } = req.body;

  const results = [];

  const bufferStream = new stream.PassThrough();
  bufferStream.end(req.file.buffer);

  bufferStream
    .pipe(csv({ mapHeaders: ({ header }) => header.trim() }))
    .on("data", (row) => {
      // Only add rows that have both front_content and back_content
      if (row.front_content && row.front_content.trim() && 
          row.back_content && row.back_content.trim()) {
        results.push(row);
      }
    })
    .on("end", async () => {
      // Validate that we have at least one valid card
      if (results.length === 0) {
        return res.status(400).json({ 
          error: "No valid cards found in CSV. Ensure each row has front_content and back_content." 
        });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const setInsert = await client.query(
          `INSERT INTO flash_card_set (set_name, language, proficiency_level, number_of_cards)
           VALUES ($1, 'German', $2, $3)
           RETURNING set_id`,
          [set_name, proficiency_level, results.length]
        );

        const set_id = setInsert.rows[0].set_id;

        const cardRows = results.map((row) => [
          set_id,
          row.front_content.trim(),
          row.back_content.trim(),
          row.hint ? row.hint.trim() : null,
        ]);

        const values = [];
        const placeholders = [];

        cardRows.forEach((row, i) => {
          const baseIndex = i * 4;
          placeholders.push(
            `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${
              baseIndex + 4
            })`
          );
          values.push(...row);
        });

        const insertQuery = `
          INSERT INTO card (set_id, front_content, back_content, hint)
          VALUES ${placeholders.join(",")}
        `;

        await client.query(insertQuery, values);

        await client.query("COMMIT");

        res.json({
          message: "Set and cards uploaded successfully",
          set_id,
          cardsInserted: cardRows.length,
        });
      } catch (err) {
        await client.query("ROLLBACK");
        console.error("Transaction error:", err);
        res.status(500).json({ 
          error: "Error adding flashcard set",
          details: err.message 
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

async function deleteFlashSet(req, res) {
  const { set_name, proficiency_level } = req.body;

  if (!set_name || !proficiency_level)
    return res
      .status(400)
      .json({ msg: "set_name or proficiency_level not found" });
  try {
    await pool.query(
      "DELETE FROM flash_card_set where set_name = $1 AND proficiency_level= $2 AND language ='German'",
      [set_name, proficiency_level]
    );
    res.status(200).json({ message: "deleted chapter successfully" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "couldn't delete the chapter" });
  }
}
module.exports = { addFlashSet, deleteFlashSet };
