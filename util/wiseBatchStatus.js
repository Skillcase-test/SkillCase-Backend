"use strict";

const { pool } = require("./db");

function normalizeBatchId(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

async function getBatchStatusMap(batchIds = []) {
  const ids = [...new Set(batchIds.map(normalizeBatchId).filter(Boolean))];
  if (ids.length === 0) return new Map();

  const { rows } = await pool.query(
    `SELECT batch_id, is_active
     FROM wise_batch_status
     WHERE batch_id = ANY($1::text[])`,
    [ids],
  );

  const map = new Map();
  for (const row of rows) {
    map.set(String(row.batch_id), Boolean(row.is_active));
  }
  return map;
}

function applyBatchStatus(batches = [], statusMap = new Map()) {
  return batches.map((batch) => {
    const id = normalizeBatchId(batch.id);
    const isActive = statusMap.has(id) ? statusMap.get(id) : true;
    return {
      ...batch,
      isActive,
      effectiveStatus: isActive ? "active" : "inactive",
    };
  });
}

function filterByStatus(batches = [], status = "active") {
  const normalized = String(status || "active").toLowerCase();
  if (normalized === "all") return batches;
  if (normalized === "inactive")
    return batches.filter((b) => b.isActive === false);
  return batches.filter((b) => b.isActive !== false);
}

async function setBatchActiveState(batchId, isActive) {
  const id = normalizeBatchId(batchId);
  const active = Boolean(isActive);

  const { rows } = await pool.query(
    `INSERT INTO wise_batch_status (batch_id, is_active, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (batch_id) DO UPDATE
     SET is_active = EXCLUDED.is_active,
         updated_at = NOW()
     RETURNING batch_id, is_active, updated_at`,
    [id, active],
  );

  return {
    batchId: rows[0].batch_id,
    isActive: rows[0].is_active,
    effectiveStatus: rows[0].is_active ? "active" : "inactive",
    updatedAt: rows[0].updated_at,
  };
}

async function isBatchActive(batchId) {
  const id = normalizeBatchId(batchId);
  if (!id) return false;

  const { rows } = await pool.query(
    `SELECT is_active
     FROM wise_batch_status
     WHERE batch_id = $1`,
    [id],
  );

  if (rows.length === 0) return true;
  return Boolean(rows[0].is_active);
}

module.exports = {
  getBatchStatusMap,
  applyBatchStatus,
  filterByStatus,
  setBatchActiveState,
  isBatchActive,
};

