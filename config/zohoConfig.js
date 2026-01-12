const path = require("path");
const fs = require("fs");

const config = {
  clientId: process.env.ZOHO_CLIENT_ID,
  clientSecret: process.env.ZOHO_CLIENT_SECRET,
  refreshToken: process.env.ZOHO_REFRESH_TOKEN,
  redirectUri: process.env.ZOHO_REDIRECT_URI,
  tokenFilePath: path.join(__dirname, "../runtime/zoho_token.txt"),
  apiBaseUrl: "https://www.zohoapis.in/bigin/v2",
  accountsUrl: "https://accounts.zoho.in/oauth/v2/token",
};

// Ensures runtime directory exists
const runtimeDir = path.join(__dirname, "../runtime");
if (!fs.existsSync(runtimeDir)) {
  fs.mkdirSync(runtimeDir, { recursive: true });
}

module.exports = config;
