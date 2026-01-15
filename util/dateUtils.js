/**
 * Date utility functions for consistent timezone handling
 * Works identically on local (IST) and production (UTC) servers
 * 
 * Key principle: NEVER rely on server's local timezone.
 * Always use explicit timezone conversion via Intl.DateTimeFormat.
 */

const DEFAULT_TIMEZONE = "Asia/Kolkata";

/**
 * Format a Date object as YYYY-MM-DD in a specific timezone
 * Use this when comparing dates with database DATE columns
 * 
 * @param {Date|string} date - Date to format
 * @param {string} timezone - IANA timezone (e.g., "Asia/Kolkata")
 * @returns {string|null} - "YYYY-MM-DD" or null if invalid
 */
function formatDateInTimezone(date, timezone = DEFAULT_TIMEZONE) {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(d); // Returns "YYYY-MM-DD"
}

/**
 * Format a Date object as HH:MM:SS in a specific timezone
 * Use this when comparing times with database TIME columns
 * 
 * @param {Date|string} date - Date to format
 * @param {string} timezone - IANA timezone
 * @returns {string|null} - "HH:MM:SS" or null if invalid
 */
function formatTimeInTimezone(date, timezone = DEFAULT_TIMEZONE) {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;

  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return formatter.format(d); // Returns "HH:MM:SS"
}

/**
 * Get current date as YYYY-MM-DD in a specific timezone
 * 
 * @param {string} timezone - IANA timezone
 * @returns {string} - "YYYY-MM-DD"
 */
function getTodayInTimezone(timezone = DEFAULT_TIMEZONE) {
  return formatDateInTimezone(new Date(), timezone);
}

/**
 * Get current datetime parts in a specific timezone
 * 
 * @param {string} timezone - IANA timezone
 * @returns {Object} - { date: "YYYY-MM-DD", time: "HH:MM:SS" }
 */
function getNowInTimezone(timezone = DEFAULT_TIMEZONE) {
  const now = new Date();
  return {
    date: formatDateInTimezone(now, timezone),
    time: formatTimeInTimezone(now, timezone),
  };
}

module.exports = {
  DEFAULT_TIMEZONE,
  formatDateInTimezone,
  formatTimeInTimezone,
  getTodayInTimezone,
  getNowInTimezone,
};
