function syncAuthMiddleware(req, res, next) {
  const apiKey = req.headers["x-sync-api-key"];
  if (!apiKey || apiKey !== process.env.SYNC_API_KEY) {
    return res.status(401).json({ msg: "Unauthorized: Invalid sync API key" });
  }
  next();
}

module.exports = { syncAuthMiddleware };
