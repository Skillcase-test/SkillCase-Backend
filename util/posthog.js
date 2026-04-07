const { PostHog } = require('posthog-node');
require('dotenv').config();

let posthogClient = null;

if (process.env.POSTHOG_API_KEY && process.env.POSTHOG_HOST) {
  posthogClient = new PostHog(
    process.env.POSTHOG_API_KEY,
    { host: process.env.POSTHOG_HOST }
  );
} else {
  console.warn('[PostHog] POSTHOG_API_KEY or POSTHOG_HOST is missing in .env. Event tracking is disabled.');
  // Mock client so the app doesn't crash if env vars are missing
  posthogClient = {
    capture: () => {},
    identify: () => {},
    shutdown: () => {},
  };
}

module.exports = posthogClient;
