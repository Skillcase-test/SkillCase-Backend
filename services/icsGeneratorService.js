const ics = require("ics");

// Generate an .ics calendar file for an event
function generateICS(eventData) {
  const {
    title,
    description,
    startDatetime,
    endDatetime,
    timezone = "Asia/Kolkata",
    meetingLink,
  } = eventData;

  // Helper: Get date components in a specific timezone
  const getDateComponentsInTimezone = (isoDatetime, tz) => {
    const date = new Date(isoDatetime);
    
    // Format in the target timezone to extract components
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    
    const parts = formatter.formatToParts(date);
    const get = (type) => parseInt(parts.find(p => p.type === type)?.value || "0");
    
    return [get("year"), get("month"), get("day"), get("hour"), get("minute")];
  };

  // Parse start datetime in the event's timezone
  const startArray = getDateComponentsInTimezone(startDatetime, timezone);
  
  // Calculate end time
  let endArray;
  const endDate = new Date(endDatetime);
  
  if (isNaN(endDate.getTime())) {
    // Default to 1 hour after start if endDatetime is invalid
    const startDate = new Date(startDatetime);
    const calculatedEnd = new Date(startDate.getTime() + 60 * 60 * 1000);
    endArray = getDateComponentsInTimezone(calculatedEnd.toISOString(), timezone);
  } else {
    endArray = getDateComponentsInTimezone(endDatetime, timezone);
  }

  const event = {
    start: startArray,
    startInputType: "local",
    startOutputType: "local",
    end: endArray,
    endInputType: "local",
    endOutputType: "local",
    title,
    description: `${description || ""}\n\nJoin Meeting: ${meetingLink}`,
    url: meetingLink,
    location: "Online",
    status: "CONFIRMED",
    busyStatus: "BUSY",
    organizer: { name: "Skillcase", email: "info@skillcase.in" },
  };

  return new Promise((resolve, reject) => {
    ics.createEvent(event, (error, value) => {
      if (error) {
        reject(error);
      } else {
        resolve(Buffer.from(value, "utf-8"));
      }
    });
  });
}

module.exports = { generateICS };
