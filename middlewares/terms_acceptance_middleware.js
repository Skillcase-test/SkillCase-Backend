const { pool } = require("../util/db");
const { TERMS_ENFORCEMENT_ENABLED } = require("../config/configuration");

async function requirePaidTermsAcceptance(req, res, next) {
  try {
    if (!TERMS_ENFORCEMENT_ENABLED) {
      return next();
    }

    if (!req.user || req.user.role !== "user") {
      return next();
    }

    const result = await pool.query(
      `SELECT
         COALESCE(is_paid, FALSE) AS is_paid,
         COALESCE(terms_required, FALSE) AS terms_required,
         COALESCE(terms_accepted, FALSE) AS terms_accepted
       FROM app_user
       WHERE user_id = $1`,
      [req.user.user_id],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ msg: "Unauthorized" });
    }

    const user = result.rows[0];
    const mustAcceptTerms =
      user.is_paid && user.terms_required && !user.terms_accepted;

    if (mustAcceptTerms) {
      return res.status(403).json({
        code: "TERMS_ACCEPTANCE_REQUIRED",
        message: "Please accept terms and conditions to continue.",
      });
    }

    return next();
  } catch (error) {
    console.error("Terms acceptance check failed:", error);
    return res.status(500).json({ msg: "Error validating terms acceptance" });
  }
}

module.exports = { requirePaidTermsAcceptance };
