const { pool } = require("../util/db");
const { ADMIN_MODULES } = require("../constants/adminPermissions");

async function getUserAdminPermissions(userId) {
  const [permissionRows, wiseScopeRows, wiseBatchRows, termsScopeRows, termsTemplateRows] = await Promise.all([
    pool.query(
      `SELECT module_key, action_key
       FROM admin_user_permission
       WHERE user_id = $1`,
      [userId],
    ),
    pool.query(
      `SELECT has_full_access
       FROM admin_wise_scope
       WHERE user_id = $1`,
      [userId],
    ),
    pool.query(
      `SELECT batch_id
       FROM admin_wise_batch_access
       WHERE user_id = $1`,
      [userId],
    ),
    pool.query(
      `SELECT has_full_access
       FROM admin_terms_scope
       WHERE user_id = $1`,
      [userId],
    ),
    pool.query(
      `SELECT template_id
       FROM admin_terms_template_access
       WHERE user_id = $1`,
      [userId],
    ),
  ]);

  const permissions = {};
  for (const row of permissionRows.rows) {
    if (!permissions[row.module_key]) {
      permissions[row.module_key] = [];
    }
    permissions[row.module_key].push(row.action_key);
  }

  return {
    permissions,
    wise: {
      has_full_access: Boolean(wiseScopeRows.rows[0]?.has_full_access),
      batch_ids: wiseBatchRows.rows.map((row) => String(row.batch_id)),
    },
    terms: {
      has_full_access: Boolean(termsScopeRows.rows[0]?.has_full_access),
      template_ids: termsTemplateRows.rows.map((row) => String(row.template_id)),
    },
  };
}

async function hydrateAdminAccess(req, res, next) {
  try {
    if (!req.user?.user_id) {
      return res.status(401).json({ msg: "not authenticated" });
    }
    if (req.user.role === "super_admin") {
      req.adminAccess = {
        isSuperAdmin: true,
        permissions: {},
        wise: {
          has_full_access: true,
          batch_ids: [],
        },
        terms: {
          has_full_access: true,
          template_ids: [],
        },
      };
      return next();
    }

    const access = await getUserAdminPermissions(req.user.user_id);
    req.adminAccess = {
      isSuperAdmin: false,
      ...access,
    };
    return next();
  } catch (err) {
    console.error("Failed to hydrate admin access:", err);
    return res.status(500).json({ msg: "failed to load admin access" });
  }
}

async function authorizeAdminOrSuperAdmin(req, res, next) {
  try {
    if (!req.user?.user_id) {
      return res.status(401).json({ msg: "not authenticated" });
    }
    const result = await pool.query(
      "SELECT role FROM app_user WHERE user_id = $1",
      [req.user.user_id],
    );
    const role = result.rows[0]?.role || req.user.role;
    req.user.role = role;
    if (!["admin", "super_admin"].includes(role)) {
      return res.status(403).json({ msg: "admin access required" });
    }
    return next();
  } catch (err) {
    console.error("Failed role authorization:", err);
    return res.status(500).json({ msg: "failed role authorization" });
  }
}

function requireAdminPermission(moduleKey, actionKey = "view") {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ msg: "not authenticated" });
    if (req.user.role === "super_admin") return next();

    // Guard: hydrateAdminAccess must run before this middleware.
    // If it did not, fail loudly rather than silently denying with a confusing message.
    if (!req.adminAccess) {
      console.error(
        `requireAdminPermission(${moduleKey}, ${actionKey}): req.adminAccess is not set. ` +
          "Ensure hydrateAdminAccess runs before this middleware.",
      );
      return res.status(403).json({ msg: "admin context not loaded" });
    }

    const actions = req.adminAccess?.permissions?.[moduleKey] || [];
    if (!actions.includes(actionKey) && !actions.includes("manage")) {
      return res.status(403).json({
        msg: "you do not have permission",
        module: moduleKey,
        action: actionKey,
      });
    }
    return next();
  };
}

function requireSuperAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ msg: "not authenticated" });
  if (req.user.role !== "super_admin") {
    return res.status(403).json({ msg: "super admin access required" });
  }
  return next();
}

function requireWiseBatchAccess(batchIdResolver) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ msg: "not authenticated" });
    if (req.user.role === "super_admin") return next();

    const adminAccess = req.adminAccess || {};
    const hasWiseModule =
      (adminAccess.permissions?.[ADMIN_MODULES.WISE] || []).length > 0;
    if (!hasWiseModule) {
      return res.status(403).json({ msg: "wise access denied" });
    }

    if (adminAccess.wise?.has_full_access) return next();

    const batchId = batchIdResolver(req);
    if (!batchId) {
      return res.status(400).json({ msg: "batch id required" });
    }

    const allowedBatchIds = adminAccess.wise?.batch_ids || [];
    if (!allowedBatchIds.includes(String(batchId))) {
      return res.status(403).json({ msg: "batch access denied" });
    }
    return next();
  };
}

module.exports = {
  hydrateAdminAccess,
  requireAdminPermission,
  requireWiseBatchAccess,
  requireSuperAdmin,
  getUserAdminPermissions,
  authorizeAdminOrSuperAdmin,
};
