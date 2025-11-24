const dotenv = require("dotenv");

dotenv.config();

const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY;
const SUBSCRIPTION_KEY = process.env.SUBSCRIPTION_KEY;
const REGION = process.env.REGION;
// console.log("Secret key " + JWT_SECRET_KEY);
const db_config = {
  connection_string: process.env.CON_STRING,
  // ssl: {
  //   rejectUnauthorized: false,
  // },
};
// console.log(db_config);

module.exports = { db_config, JWT_SECRET_KEY, SUBSCRIPTION_KEY, REGION };
