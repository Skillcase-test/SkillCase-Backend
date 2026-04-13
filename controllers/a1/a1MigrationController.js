const { pool } = require("../../util/db");

const A1_REVAMP_FORCE_CUTOFF =
  process.env.A1_REVAMP_FORCE_CUTOFF || "2026-06-30T23:59:59Z";
const A1_REVAMP_LAUNCH_DATE = process.env.A1_REVAMP_LAUNCH_DATE || "";
const A1_REVAMP_GRACE_MONTHS = Number(process.env.A1_REVAMP_GRACE_MONTHS || 2);

function addMonthsKeepingUtc(date, months) {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCMonth(result.getUTCMonth() + months);
  if (result.getUTCDate() < day) {
    result.setUTCDate(0);
  }
  return result;
}

function resolveForceCutoffDate() {
  const explicitCutoff = new Date(A1_REVAMP_FORCE_CUTOFF);
  if (!Number.isNaN(explicitCutoff.getTime())) {
    return explicitCutoff;
  }

  const launchDate = new Date(A1_REVAMP_LAUNCH_DATE);
  if (
    !Number.isNaN(launchDate.getTime()) &&
    Number.isFinite(A1_REVAMP_GRACE_MONTHS) &&
    A1_REVAMP_GRACE_MONTHS >= 0
  ) {
    return addMonthsKeepingUtc(launchDate, A1_REVAMP_GRACE_MONTHS);
  }

  return null;
}

function isForceCutoffReached() {
  const cutoff = resolveForceCutoffDate();
  if (!cutoff) {
    return false;
  }
  return new Date() >= cutoff;
}

async function getUserMigrationState(userId) {
  const result = await pool.query(
    `
    SELECT a1_revamp_status, a1_revamp_opted_at
    FROM app_user
    WHERE user_id = $1
    `,
    [userId],
  );

  return result.rows[0] || null;
}

async function forceLegacyUsersIfNeeded(userId, status) {
  if (!isForceCutoffReached()) {
    return status;
  }

  if (status === "legacy_a1" || status === "legacy_acknowledged") {
    await pool.query(
      `
      UPDATE app_user
      SET a1_revamp_status = 'revamp_forced_after_deadline'
      WHERE user_id = $1
      `,
      [userId],
    );
    return "revamp_forced_after_deadline";
  }

  return status;
}

async function getStatus(req, res) {
  const userId = req.user?.user_id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const state = await getUserMigrationState(userId);
    if (!state) return res.status(404).json({ error: "User not found" });

    const normalizedStatus = state.a1_revamp_status || "legacy_a1";
    const effectiveStatus = await forceLegacyUsersIfNeeded(
      userId,
      normalizedStatus,
    );

    const cutoff = resolveForceCutoffDate();
    const forceCutoffReached = isForceCutoffReached();
    const showModal = effectiveStatus === "legacy_a1" && !forceCutoffReached;

    res.json({
      status: effectiveStatus,
      forceCutoffReached,
      forceCutoffDate: cutoff ? cutoff.toISOString() : null,
      gracePeriodMonths: Number.isFinite(A1_REVAMP_GRACE_MONTHS)
        ? A1_REVAMP_GRACE_MONTHS
        : 2,
      showModal,
      optedAt: state.a1_revamp_opted_at || null,
    });
  } catch (err) {
    console.error("Error fetching A1 migration status:", err);
    res.status(500).json({ error: "Failed to fetch migration status" });
  }
}

async function saveDecision(req, res) {
  const userId = req.user?.user_id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { action } = req.body;
  if (!["opt_in_now", "remind_later"].includes(action)) {
    return res.status(400).json({ error: "Invalid action" });
  }

  try {
    if (action === "opt_in_now") {
      await pool.query(
        `
        UPDATE app_user
        SET a1_revamp_status = 'revamp_opted_in',
            a1_revamp_opted_at = NOW()
        WHERE user_id = $1
        `,
        [userId],
      );
    } else {
      await pool.query(
        `
        UPDATE app_user
        SET a1_revamp_status = 'legacy_acknowledged'
        WHERE user_id = $1
        `,
        [userId],
      );
    }

    res.json({ success: true, action });
  } catch (err) {
    console.error("Error saving A1 migration decision:", err);
    res.status(500).json({ error: "Failed to save migration decision" });
  }
}

async function getEntryRoute(req, res) {
  const userId = req.user?.user_id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const state = await getUserMigrationState(userId);
    if (!state) return res.status(404).json({ error: "User not found" });

    const normalizedStatus = state.a1_revamp_status || "legacy_a1";
    const effectiveStatus = await forceLegacyUsersIfNeeded(
      userId,
      normalizedStatus,
    );

    // Legacy users stay on old A1 during grace period.
    if (
      ["legacy_a1", "legacy_acknowledged"].includes(effectiveStatus) &&
      !isForceCutoffReached()
    ) {
      return res.json({ route: "/practice/A1", status: effectiveStatus });
    }

    // Revamped entry for new users, opted-in, and forced users.
    return res.json({ route: "/a1/flashcard", status: effectiveStatus });
  } catch (err) {
    console.error("Error resolving A1 entry route:", err);
    res.status(500).json({ error: "Failed to resolve entry route" });
  }
}

module.exports = {
  getStatus,
  saveDecision,
  getEntryRoute,
};
