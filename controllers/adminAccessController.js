const { pool } = require("../util/db");
const {
  ADMIN_MODULES,
  ADMIN_ACTIONS,
} = require("../constants/adminPermissions");
const {
  getUserAdminPermissions,
} = require("../middlewares/admin_permission_middleware");

const VALID_MODULES = new Set(Object.values(ADMIN_MODULES));
const VALID_ACTIONS = new Set(Object.values(ADMIN_ACTIONS));

function normalizePermissions(input) {
  if (!input || typeof input !== "object") return {};
  const out = {};
  for (const [moduleKey, actions] of Object.entries(input)) {
    if (!VALID_MODULES.has(moduleKey)) continue;
    const filtered = Array.isArray(actions)
      ? [...new Set(actions.filter((action) => VALID_ACTIONS.has(action)))]
      : [];
    if (filtered.length > 0) out[moduleKey] = filtered;
  }
  return out;
}

async function listAdminUsers(req, res) {
  const q = String(req.query.q || "")
    .trim()
    .toLowerCase();
  const params = [];
  let whereSql = "WHERE role IN ('user', 'admin', 'super_admin')";

  if (q) {
    params.push(`%${q}%`);
    whereSql += ` AND (
      LOWER(COALESCE(fullname, '')) LIKE $${params.length}
      OR LOWER(COALESCE(username, '')) LIKE $${params.length}
      OR LOWER(COALESCE(email, '')) LIKE $${params.length}
      OR COALESCE(phone, '') LIKE $${params.length}
      OR COALESCE(number, '') LIKE $${params.length}
    )`;
  }

  const result = await pool.query(
    `SELECT user_id, username, fullname, email, phone, number, role
     FROM app_user
     ${whereSql}
     ORDER BY
       CASE role
         WHEN 'super_admin' THEN 1
         WHEN 'admin' THEN 2
         ELSE 3
       END,
       created_at DESC
     LIMIT 300`,
    params,
  );

  return res.json({ users: result.rows });
}

async function updateUserRole(req, res) {
  const { userId } = req.params;
  const { role } = req.body;
  if (!["user", "admin", "super_admin"].includes(role)) {
    return res.status(400).json({ msg: "invalid role" });
  }
  if (req.user.user_id === userId && role !== "super_admin") {
    return res.status(400).json({ msg: "cannot downgrade self" });
  }

  const result = await pool.query(
    `UPDATE app_user
     SET role = $1, modified_at = NOW()
     WHERE user_id = $2
     RETURNING user_id, username, fullname, email, phone, role`,
    [role, userId],
  );
  if (!result.rows.length) {
    return res.status(404).json({ msg: "user not found" });
  }

  if (role !== "admin") {
    await pool.query("DELETE FROM admin_user_permission WHERE user_id = $1", [
      userId,
    ]);
    await pool.query("DELETE FROM admin_wise_scope WHERE user_id = $1", [
      userId,
    ]);
    await pool.query("DELETE FROM admin_wise_batch_access WHERE user_id = $1", [
      userId,
    ]);
  }

  return res.json({ user: result.rows[0] });
}

async function getUserPermissions(req, res) {
  const { userId } = req.params;
  const userResult = await pool.query(
    "SELECT user_id, role FROM app_user WHERE user_id = $1",
    [userId],
  );
  if (!userResult.rows.length) {
    return res.status(404).json({ msg: "user not found" });
  }

  const permissions = await getUserAdminPermissions(userId);
  return res.json({
    user: userResult.rows[0],
    permissions: permissions.permissions,
  });
}

async function putUserPermissions(req, res) {
  const { userId } = req.params;
  const normalized = normalizePermissions(req.body?.permissions);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM admin_user_permission WHERE user_id = $1", [
      userId,
    ]);

    for (const [moduleKey, actions] of Object.entries(normalized)) {
      for (const action of actions) {
        await client.query(
          `INSERT INTO admin_user_permission (user_id, module_key, action_key)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, module_key, action_key) DO NOTHING`,
          [userId, moduleKey, action],
        );
      }
    }
    await client.query("COMMIT");
    return res.json({ permissions: normalized });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Failed to update user permissions:", err);
    return res.status(500).json({ msg: "failed to update permissions" });
  } finally {
    client.release();
  }
}

async function getUserWiseAccess(req, res) {
  const { userId } = req.params;
  const access = await getUserAdminPermissions(userId);
  return res.json({ wise: access.wise });
}

async function putUserWiseAccess(req, res) {
  const { userId } = req.params;
  const hasFullAccess = Boolean(req.body?.has_full_access);
  const batchIds = Array.isArray(req.body?.batch_ids)
    ? [
        ...new Set(
          req.body.batch_ids.map((id) => String(id).trim()).filter(Boolean),
        ),
      ]
    : [];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO admin_wise_scope (user_id, has_full_access)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE
       SET has_full_access = EXCLUDED.has_full_access,
           updated_at = NOW()`,
      [userId, hasFullAccess],
    );
    await client.query(
      "DELETE FROM admin_wise_batch_access WHERE user_id = $1",
      [userId],
    );
    for (const batchId of batchIds) {
      await client.query(
        `INSERT INTO admin_wise_batch_access (user_id, batch_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, batch_id) DO NOTHING`,
        [userId, batchId],
      );
    }
    await client.query("COMMIT");
    return res.json({
      wise: { has_full_access: hasFullAccess, batch_ids: batchIds },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Failed to update wise access:", err);
    return res.status(500).json({ msg: "failed to update wise access" });
  } finally {
    client.release();
  }
}

async function getCurrentSessionAdminAccess(req, res) {
  const user = req.user;
  if (!user) return res.status(401).json({ msg: "not authenticated" });

  const roleResult = await pool.query(
    "SELECT role FROM app_user WHERE user_id = $1",
    [user.user_id],
  );
  const dbRole = roleResult.rows[0]?.role || user.role;

  if (!["admin", "super_admin"].includes(dbRole)) {
    return res.status(403).json({ msg: "admin access required" });
  }

  if (dbRole === "super_admin") {
    return res.json({
      role: dbRole,
      permissions: Object.values(ADMIN_MODULES).reduce((acc, moduleKey) => {
        acc[moduleKey] = Object.values(ADMIN_ACTIONS);
        return acc;
      }, {}),
      wise: { has_full_access: true, batch_ids: [] },
    });
  }

  const access = await getUserAdminPermissions(user.user_id);
  return res.json({
    role: dbRole,
    permissions: access.permissions,
    wise: access.wise,
  });
}

module.exports = {
  listAdminUsers,
  updateUserRole,
  getUserPermissions,
  putUserPermissions,
  getUserWiseAccess,
  putUserWiseAccess,
  getCurrentSessionAdminAccess,
};
