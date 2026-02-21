const { pool } = require("../util/db");

// CREATE BATCH
async function createBatch(req, res) {
  const { batch_name, description } = req.body;
  if (!batch_name || !batch_name.trim()) {
    return res.status(400).json({ msg: "Batch name is required" });
  }
  try {
    const result = await pool.query(
      `INSERT INTO batch (batch_name, description) VALUES ($1, $2) RETURNING *`,
      [batch_name.trim(), description || null],
    );
    res.status(201).json({ batch: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res
        .status(409)
        .json({ msg: "A batch with this name already exists" });
    }
    console.error("Error creating batch:", err);
    res.status(500).json({ msg: "Failed to create batch" });
  }
}

// LIST BATCHES
async function listBatches(req, res) {
  try {
    const result = await pool.query(
      `SELECT b.*, COUNT(ub.user_id)::int AS student_count
       FROM batch b
       LEFT JOIN user_batch ub ON ub.batch_id = b.batch_id
       GROUP BY b.batch_id
       ORDER BY b.created_at DESC`,
    );
    res.json({ batches: result.rows });
  } catch (err) {
    console.error("Error listing batches:", err);
    res.status(500).json({ msg: "Failed to list batches" });
  }
}

// UPDATE BATCH
async function updateBatch(req, res) {
  const { batchId } = req.params;
  const { batch_name, description } = req.body;
  if (!batch_name || !batch_name.trim()) {
    return res.status(400).json({ msg: "Batch name is required" });
  }
  try {
    const result = await pool.query(
      `UPDATE batch SET batch_name = $1, description = $2 WHERE batch_id = $3 RETURNING *`,
      [batch_name.trim(), description || null, batchId],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ msg: "Batch not found" });
    }
    res.json({ batch: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res
        .status(409)
        .json({ msg: "A batch with this name already exists" });
    }
    console.error("Error updating batch:", err);
    res.status(500).json({ msg: "Failed to update batch" });
  }
}

// DELETE BATCH
async function deleteBatch(req, res) {
  const { batchId } = req.params;
  try {
    const result = await pool.query(
      `DELETE FROM batch WHERE batch_id = $1 RETURNING batch_id`,
      [batchId],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ msg: "Batch not found" });
    }
    res.json({ msg: "Batch deleted successfully" });
  } catch (err) {
    console.error("Error deleting batch:", err);
    res.status(500).json({ msg: "Failed to delete batch" });
  }
}

// GET STUDENTS IN BATCH
async function getBatchStudents(req, res) {
  const { batchId } = req.params;
  try {
    const result = await pool.query(
      `SELECT u.user_id, u.username, u.fullname, u.number, u.current_profeciency_level, ub.assigned_at
       FROM user_batch ub
       JOIN app_user u ON u.user_id = ub.user_id
       WHERE ub.batch_id = $1
       ORDER BY ub.assigned_at DESC`,
      [batchId],
    );
    res.json({ students: result.rows });
  } catch (err) {
    console.error("Error getting batch students:", err);
    res.status(500).json({ msg: "Failed to get batch students" });
  }
}

// ASSIGN STUDENTS TO BATCH
async function assignStudents(req, res) {
  const { batchId } = req.params;
  const { user_ids } = req.body;
  if (!Array.isArray(user_ids) || user_ids.length === 0) {
    return res.status(400).json({ msg: "user_ids array is required" });
  }
  try {
    // Verify batch exists
    const batchCheck = await pool.query(
      `SELECT batch_id FROM batch WHERE batch_id = $1`,
      [batchId],
    );
    if (batchCheck.rows.length === 0) {
      return res.status(404).json({ msg: "Batch not found" });
    }

    let assigned = 0;
    for (const userId of user_ids) {
      try {
        await pool.query(
          `INSERT INTO user_batch (user_id, batch_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [userId, batchId],
        );
        assigned++;
      } catch (innerErr) {
        console.error(`Error assigning user ${userId}:`, innerErr.message);
      }
    }
    res.json({ msg: `${assigned} student(s) assigned to batch`, assigned });
  } catch (err) {
    console.error("Error assigning students:", err);
    res.status(500).json({ msg: "Failed to assign students" });
  }
}

// REMOVE STUDENT FROM BATCH
async function removeStudent(req, res) {
  const { batchId, userId } = req.params;
  try {
    const result = await pool.query(
      `DELETE FROM user_batch WHERE batch_id = $1 AND user_id = $2 RETURNING user_id`,
      [batchId, userId],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ msg: "Student not found in this batch" });
    }
    res.json({ msg: "Student removed from batch" });
  } catch (err) {
    console.error("Error removing student:", err);
    res.status(500).json({ msg: "Failed to remove student" });
  }
}

// LIST ALL STUDENTS (for batch assignment)
async function listAllStudents(req, res) {
  try {
    const result = await pool.query(
      `SELECT user_id, username, fullname, number, current_profeciency_level
       FROM app_user
       ORDER BY fullname ASC, username ASC`,
    );
    res.json({ students: result.rows });
  } catch (err) {
    console.error("Error listing students:", err);
    res.status(500).json({ msg: "Failed to list students" });
  }
}

module.exports = {
  createBatch,
  listBatches,
  updateBatch,
  deleteBatch,
  getBatchStudents,
  assignStudents,
  removeStudent,
  listAllStudents,
};
