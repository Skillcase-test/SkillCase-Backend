const CURRENT_VERSION = "1.0.0";

const BUNDLE_URL = `${process.env.BACKEND_URL}/updates/bundle.zip`;

const checkIfNeedUpdate = async (req, res) => {
  const appVersion = req.query.version;
  res.json({
    version: CURRENT_VERSION,
    url: appVersion !== CURRENT_VERSION ? BUNDLE_URL : null,
  });
};

module.exports = { checkIfNeedUpdate };
