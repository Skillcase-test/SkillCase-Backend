const axios = require("axios");

/**
 * Sends an error report to the Tech Discord Channel.
 * Requires DISCORD_TECH_WEBHOOK to be set in .env
 *
 * @param {Error} error - The error object
 * @param {Object} context - Optional context (e.g. req path, body, user)
 */
async function sendErrorToDiscord(error, context = {}) {
  const webhookUrl = process.env.DISCORD_TECH_WEBHOOK;
  if (!webhookUrl) {
    // Fail silently if no webhook is configured (e.g., in dev)
    return;
  }

  try {
    const errorName = error.name || "UnknownError";
    const errorMessage = error.message || String(error);
    const stackSnippet = (error.stack || "").split("\n").slice(0, 7).join("\n");

    let contextString = "";
    if (Object.keys(context).length > 0) {
      contextString = `**Context:**\n\`\`\`json\n${JSON.stringify(context, null, 2)}\n\`\`\`\n`;
    }

    const payload = {
      content: "🚨 <@&1173663004558000159> **Backend System Alert**", // Optional: ping a role if needed, currently just a siren
      embeds: [
        {
          title: `🛑 Error: ${errorName}`,
          description: `**Message:** ${errorMessage}\n\n${contextString}**Stack Trace:**\n\`\`\`js\n${stackSnippet}\n\`\`\``,
          color: 15158332, // Red color
          timestamp: new Date().toISOString(),
        },
      ],
    };

    await axios.post(webhookUrl, payload);
  } catch (err) {
    console.error("Failed to send error to Discord:", err.message);
  }
}

module.exports = { sendErrorToDiscord };
