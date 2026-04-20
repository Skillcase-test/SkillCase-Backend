const crypto = require("crypto");
const { INTERNAL_API_KEY } = require("../config/configuration");
const { authMiddleware } = require("./auth_middleware");
const {
  authorizeAdminOrSuperAdmin,
  hydrateAdminAccess,
} = require("./admin_permission_middleware");

function safeCompare(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));

  if (!left.length || !right.length || left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

function hasValidInternalApiKey(req) {
  const providedApiKey = req.headers["x-internal-api-key"];
  if (!INTERNAL_API_KEY || !providedApiKey) {
    return false;
  }

  return safeCompare(providedApiKey, INTERNAL_API_KEY);
}

function requireInternalAuth(req, res, next) {
  if (hasValidInternalApiKey(req)) {
    req.user = {
      user_id: "internal_api_key",
      role: "super_admin",
    };
    req.adminAccess = {
      isSuperAdmin: true,
      permissions: {},
      wise: {
        has_full_access: true,
        batch_ids: [],
      },
    };
    return next();
  }

  return authMiddleware(req, res, () => {
    authorizeAdminOrSuperAdmin(req, res, () => {
      hydrateAdminAccess(req, res, next);
    });
  });
}

module.exports = {
  requireInternalAuth,
};
