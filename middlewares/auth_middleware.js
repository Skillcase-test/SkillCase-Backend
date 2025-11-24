const { JWT_SECRET_KEY } = require("../config/configuration");
const jwt = require("jsonwebtoken");

function authMiddleware(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) {
    return res.sendStatus(401);
  }
  jwt.verify(token, JWT_SECRET_KEY, (err, user) => {
    if (err) {
      return res.status(403).send(err);
    }

    req.user = user;
    next();
  });
}

function authorizeRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ msg: "not authenticated" });

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ msg: "you do not have permission" });
    }

    next();
  };
}

function optionalAuth(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    req.user = null;
    return next();
  }

  jwt.verify(token, JWT_SECRET_KEY, (err, user) => {
    if (err) {
      return res.sendStatus(403);
    }
    req.user = user;
    next();
  });
}
module.exports = { authMiddleware, authorizeRole, optionalAuth };
