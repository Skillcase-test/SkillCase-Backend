const { pool } = require("../util/db");
const crypto = require("crypto");
const { generateICS } = require("../services/icsGeneratorService");
const { sendEventRegistrationEmail } = require("../services/emailService");
const { sendNewEventNotification } = require("../services/emailService");
const { RRule } = require("rrule");
const {
  sendRegistrationConfirmation,
  sendEventReminder,
  isValidPhone,
} = require("../services/aiSensyService");
const { insertEventRegistrant } = require("../services/biginService");
const { formatDateInTimezone } = require("../util/dateUtils");

// Helper: Generate slug from title
function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Helper: Generate latest instance date
function getNextInstanceDate(rruleString, startDatetime, timezone) {
  if (!rruleString || !startDatetime) {
    console.log("[getNextInstanceDate] Missing data:", {
      rruleString,
      startDatetime,
    });
    return null;
  }
  try {
    const baseDate = new Date(startDatetime);
    const now = new Date();
    console.log("[getNextInstanceDate] Parsing:", {
      rruleString,
      baseDate: baseDate.toISOString(),
    });

    // Parse the RRULE string
    const rule = RRule.fromString(
      `DTSTART:${
        baseDate.toISOString().replace(/[-:]/g, "").split(".")[0]
      }Z\nRRULE:${rruleString}`
    );
    // Get next occurrence after now
    const nextDate = rule.after(now, true);
    console.log("[getNextInstanceDate] Result:", nextDate);
    return nextDate;
  } catch (err) {
    console.error("Error parsing RRULE:", err);
    return null;
  }
}

// CREATE EVENT - Admin only
async function createEvent(req, res) {
  const {
    title,
    slug,
    description,
    cover_image_url,
    is_featured,
    meeting_link,
    event_type,
    start_datetime,
    end_datetime,
    timezone,
    recurrence_rule,
    recurrence_timezone,
  } = req.body;
  const user_id = req.user?.user_id || null; // Optional for access code auth

  try {
    if (!title || !meeting_link || !event_type) {
      return res
        .status(400)
        .json({ msg: "Title, meeting_link, and event_type are required" });
    }
    // Generate slug if not provided
    const finalSlug = slug || generateSlug(title);

    // Check if slug already exists
    const slugCheck = await pool.query(
      "SELECT event_id FROM event WHERE slug = $1",
      [finalSlug]
    );
    if (slugCheck.rows.length > 0) {
      return res.status(400).json({
        msg: "Slug already exists. Please use a different title or slug.",
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      // If is_featured = true, unset all other featured events
      if (is_featured) {
        await client.query(
          "UPDATE event SET is_featured = FALSE WHERE is_featured = TRUE"
        );
      }

      // Insert event
      const insertQuery = `
        INSERT INTO event (
          title, slug, description, cover_image_url, is_featured, meeting_link, event_type,
          start_datetime, end_datetime, timezone, recurrence_rule, recurrence_timezone, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `;

      const result = await client.query(insertQuery, [
        title,
        finalSlug,
        description || null,
        cover_image_url || null,
        is_featured || false,
        meeting_link,
        event_type,
        start_datetime || null,
        end_datetime || null,
        timezone || null,
        recurrence_rule || null,
        recurrence_timezone || null,
        user_id,
      ]);

      await client.query("COMMIT");

      res.status(201).json({
        success: true,
        event: result.rows[0],
      });

      // notifySubscribersNewEvent(
      //   {
      //     title,
      //     description,
      //     startDatetime: start_datetime,
      //     timezone,
      //     coverImageUrl: cover_image_url,
      //     slug: finalSlug,
      //   },
      //   pool
      // ).catch((err) => console.error("Subscriber notification error:", err));
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Error in createEvent:", err);
    res.status(500).json({ msg: "Error creating event", error: err.message });
  }
}

// UPDATE EVENT - Admin only
async function updateEvent(req, res) {
  const { event_id } = req.params;
  const updates = req.body;

  try {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      // If setting is_featured = true, unset all others
      if (updates.is_featured === true) {
        await client.query(
          "UPDATE event SET is_featured = FALSE WHERE event_id != $1",
          [event_id]
        );
      }

      // Build dynamic update query
      const fields = [];
      const values = [];
      let paramIndex = 1;
      const allowedFields = [
        "title",
        "slug",
        "description",
        "cover_image_url",
        "is_featured",
        "meeting_link",
        "event_type",
        "start_datetime",
        "end_datetime",
        "timezone",
        "recurrence_rule",
        "recurrence_timezone",
      ];

      if (updates.start_datetime === "") updates.start_datetime = null;
      if (updates.end_datetime === "") updates.end_datetime = null;
      allowedFields.forEach((field) => {
        if (updates[field] !== undefined) {
          fields.push(`${field} = $${paramIndex}`);
          values.push(updates[field]);
          paramIndex++;
        }
      });

      if (fields.length === 0) {
        return res.status(400).json({ msg: "No valid fields to update" });
      }

      fields.push(`updated_at = CURRENT_TIMESTAMP`);

      values.push(event_id);

      const updateQuery = `
        UPDATE event
        SET ${fields.join(", ")}
        WHERE event_id = $${paramIndex}
        RETURNING *
      `;

      const result = await client.query(updateQuery, values);

      if (result.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ msg: "Event not found" });
      }

      await client.query("COMMIT");

      res.status(200).json({
        success: true,
        event: result.rows[0],
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Error in updateEvent:", err);
    res.status(500).json({ msg: "Error updating event", error: err.message });
  }
}

// DELETE EVENT - Admin only
async function deleteEvent(req, res) {
  const { event_id } = req.params;

  try {
    const result = await pool.query(
      "UPDATE event SET is_active = FALSE WHERE event_id = $1 RETURNING event_id",
      [event_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ msg: "Event not found" });
    }

    res.status(200).json({ success: true, msg: "Event deleted successfully" });
  } catch (err) {
    console.error("Error in deleteEvent:", err);
    res.status(500).json({ msg: "Error deleting event", error: err.message });
  }
}

// RESTORE EVENT - Admin only
async function restoreEvent(req, res) {
  const { event_id } = req.params;
  try {
    const result = await pool.query(
      "UPDATE event SET is_active = TRUE WHERE event_id = $1 RETURNING event_id",
      [event_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ msg: "Event not found" });
    }
    res.status(200).json({ success: true, msg: "Event restored successfully" });
  } catch (err) {
    console.error("Error in restoreEvent:", err);
    res.status(500).json({ msg: "Error restoring event", error: err.message });
  }
}

// PERMANENT DELETE EVENT - Admin only
async function permanentDeleteEvent(req, res) {
  const { event_id } = req.params;
  try {
    // Delete registrations first
    await pool.query("DELETE FROM event_registration WHERE event_id = $1", [
      event_id,
    ]);

    // Then delete event
    const result = await pool.query(
      "DELETE FROM event WHERE event_id = $1 RETURNING event_id",
      [event_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ msg: "Event not found" });
    }

    res.status(200).json({ success: true, msg: "Event permanently deleted" });
  } catch (err) {
    console.error("Error in permanentDeleteEvent:", err);
    res.status(500).json({ msg: "Error deleting event", error: err.message });
  }
}

// GET ALL EVENTS - Admin only
async function getAllEvents(req, res) {
  try {
    const query = `
      SELECT 
        e.*,
        COUNT(er.registration_id) AS registration_count
      FROM event e
      LEFT JOIN event_registration er ON e.event_id = er.event_id
      GROUP BY e.event_id
      ORDER BY e.is_active DESC, e.created_at DESC
    `;
    const result = await pool.query(query);
    res.status(200).json({
      success: true,
      events: result.rows,
    });
  } catch (err) {
    console.error("Error in getAllEvents:", err);
    res.status(500).json({ msg: "Error fetching events", error: err.message });
  }
}

// GET ACTIVE EVENTS - Public/Authenticated
async function getActiveEvents(req, res) {
  try {
    const query = `
      SELECT 
        event_id, title, slug, description, cover_image_url, is_featured,
        meeting_link, event_type, start_datetime, end_datetime, timezone,
        recurrence_rule, recurrence_timezone, created_at
      FROM event
      WHERE is_active = TRUE
      ORDER BY start_datetime ASC NULLS LAST
    `;
    const result = await pool.query(query);
    const expandedEvents = [];
    const now = new Date();
    const thirtyDaysLater = new Date(now);
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 60);
    for (const event of result.rows) {
      if (event.event_type === "recurring" && event.recurrence_rule) {
        try {
          // Parse original event time
          const baseDate = new Date(event.start_datetime);
          const eventHours = baseDate.getHours();
          const eventMinutes = baseDate.getMinutes();
          // Parse the RRULE string
          const rule = RRule.fromString(
            `DTSTART:${
              baseDate.toISOString().replace(/[-:]/g, "").split(".")[0]
            }Z\nRRULE:${event.recurrence_rule}`
          );
          // Get occurrences between now and 60 days later
          const instances = rule.between(now, thirtyDaysLater, true);
          // Fetch all overrides for this event
          const overrides = await pool.query(
            "SELECT instance_date, custom_start_time, custom_end_time FROM event_instance_override WHERE event_id = $1",
            [event.event_id]
          );
          // Create map of overrides by date (YYYY-MM-DD format)
          const overrideMap = {};
          overrides.rows.forEach((o) => {
            // Use formatDateInTimezone for consistency
            const dateKey = formatDateInTimezone(o.instance_date, event.timezone || "Asia/Kolkata");
            overrideMap[dateKey] = {
              custom_start_time: o.custom_start_time,
              custom_end_time: o.custom_end_time,
            };
          });
          // Create separate entry for each instance
          instances.forEach((instanceDate, index) => {
            // Preserve original time
            const correctedDate = new Date(instanceDate);
            correctedDate.setHours(eventHours, eventMinutes, 0, 0);
            const dateKey = formatDateInTimezone(correctedDate, event.timezone || "Asia/Kolkata");
            const override = overrideMap[dateKey];
            expandedEvents.push({
              ...event,
              instance_date: correctedDate.toISOString(),
              custom_start_time: override?.custom_start_time || null,
              custom_end_time: override?.custom_end_time || null,
              is_instance: true,
              _instanceId: `${event.event_id}-${index}`,
            });
          });
        } catch (err) {
          console.error(
            `Error expanding recurring event ${event.event_id}:`,
            err
          );
          // Fallback: include as single event
          expandedEvents.push({
            ...event,
            is_instance: false,
          });
        }
      } else if (event.start_datetime) {
        // One-time event - check if in the future or today
        const eventDate = new Date(event.start_datetime);
        eventDate.setHours(0, 0, 0, 0);
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);
        if (eventDate >= todayStart) {
          expandedEvents.push({
            ...event,
            instance_date: event.start_datetime,
            is_instance: false,
          });
        }
      }
    }
    // Sort by instance_date
    expandedEvents.sort((a, b) => {
      const dateA = new Date(a.instance_date || a.start_datetime);
      const dateB = new Date(b.instance_date || b.start_datetime);
      return dateA - dateB;
    });
    res.status(200).json({
      success: true,
      events: expandedEvents,
    });
  } catch (err) {
    console.error("Error in getActiveEvents:", err);
    res.status(500).json({ msg: "Error fetching events", error: err.message });
  }
}

// GET FEATURED EVENT - Public/Authenticated
async function getFeaturedEvent(req, res) {
  try {
    const query = `
      SELECT 
        event_id, title, slug, description, cover_image_url, is_featured,
        meeting_link, event_type, start_datetime, end_datetime, timezone,
        recurrence_rule, recurrence_timezone, created_at
      FROM event
      WHERE is_featured = TRUE AND is_active = TRUE
      LIMIT 1
    `;

    const result = await pool.query(query);

    if (result.rows.length === 0) {
      return res.status(404).json({ msg: "No featured event found" });
    }

    res.status(200).json({
      success: true,
      event: result.rows[0],
    });
  } catch (err) {
    console.error("Error in getFeaturedEvent:", err);
    res
      .status(500)
      .json({ msg: "Error fetching featured event", error: err.message });
  }
}

// GET EVENT BY SLUG - Public/Authenticated
async function getEventBySlug(req, res) {
  const { slug } = req.params;
  const { instance_date } = req.query; // NEW: Accept specific date from frontend
  try {
    const query = `
      SELECT 
        event_id, title, slug, description, cover_image_url, is_featured,
        meeting_link, event_type, start_datetime, end_datetime, timezone,
        recurrence_rule, recurrence_timezone, created_at
      FROM event
      WHERE slug = $1 AND is_active = TRUE
    `;
    const result = await pool.query(query, [slug]);
    if (result.rows.length === 0) {
      return res.status(404).json({ msg: "Event not found" });
    }
    const event = result.rows[0];
    // For recurring events, calculate the next instance date OR use provided date
    let display_instance_date = null;
    let custom_start_time = null;
    let custom_end_time = null;
    if (event.event_type === "recurring" && event.recurrence_rule) {
      // Use provided instance_date if given, otherwise calculate next
      if (instance_date) {
        display_instance_date = new Date(instance_date);
      } else {
        display_instance_date = getNextInstanceDate(
          event.recurrence_rule,
          event.start_datetime,
          event.timezone
        );
      }
      // Check if this instance has an override
      if (display_instance_date) {
        const dateKey = formatDateInTimezone(display_instance_date, event.timezone || "Asia/Kolkata");
        const overrideQuery = `
          SELECT custom_start_time, custom_end_time 
          FROM event_instance_override
          WHERE event_id = $1 AND instance_date = $2
        `;
        const overrideResult = await pool.query(overrideQuery, [
          event.event_id,
          dateKey,
        ]);
        console.log("🔍 Looking for override on:", dateKey);
        console.log("🔍 Override result:", overrideResult.rows);
        if (overrideResult.rows.length > 0) {
          custom_start_time = overrideResult.rows[0].custom_start_time;
          custom_end_time = overrideResult.rows[0].custom_end_time;
        }
      }
    }
    res.status(200).json({
      success: true,
      event: {
        ...event,
        next_instance_date: display_instance_date,
        custom_start_time,
        custom_end_time,
      },
    });
  } catch (err) {
    console.error("Error in getEventBySlug:", err);
    res.status(500).json({ msg: "Error fetching event", error: err.message });
  }
}

// REGISTER FOR EVENT - Public/Authenticated
async function registerForEvent(req, res) {
  const { slug } = req.params;
  const { name, email, phone, instance_date } = req.body;

  let user_id = req.user?.user_id || null;

  try {
    if (!name || !email || !phone) {
      return res
        .status(400)
        .json({ msg: "Name, email, and phone are required" });
    }

    // Phone validation - must be 10 digits
    if (!isValidPhone(phone)) {
      return res
        .status(400)
        .json({ msg: "Phone number must be exactly 10 digits" });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ msg: "Invalid email format" });
    }

    // Verify user exists if user_id is provided
    if (user_id) {
      const userCheck = await pool.query(
        "SELECT user_id FROM app_user WHERE user_id = $1",
        [user_id]
      );
      if (userCheck.rows.length === 0) {
        console.warn(`User ${user_id} not found. Registering as anonymous.`);
        user_id = null;
      }
    }

    // Get event
    const eventQuery =
      "SELECT * FROM event WHERE slug = $1 AND is_active = TRUE";
    const eventResult = await pool.query(eventQuery, [slug]);
    if (eventResult.rows.length === 0) {
      return res.status(404).json({ msg: "Event not found" });
    }

    const event = eventResult.rows[0];

    // Check duplicate registration
    const dupCheck = await pool.query(
      "SELECT registration_id FROM event_registration WHERE event_id = $1 AND email = $2",
      [event.event_id, email]
    );

    if (dupCheck.rows.length > 0) {
      return res
        .status(400)
        .json({ msg: "You are already registered for this event" });
    }

    // Parse instance_date if provided
    let parsedInstanceDate = null;

    if (instance_date) {
      parsedInstanceDate = new Date(instance_date);
      if (isNaN(parsedInstanceDate.getTime())) {
        parsedInstanceDate = null;
      }
    }

    // Insert registration with instance_date
    const insertQuery = `
      INSERT INTO event_registration (event_id, user_id, name, email, phone, instance_date, reminder_sent)
      VALUES ($1, $2, $3, $4, $5, $6, FALSE)
      RETURNING *
    `;

    const regResult = await pool.query(insertQuery, [
      event.event_id,
      user_id,
      name,
      email,
      phone,
      parsedInstanceDate,
    ]);

    // Generate .ics file
    let icsBuffer;

    try {
      icsBuffer = await generateICS({
        title: event.title,
        description: event.description || "",
        startDatetime: parsedInstanceDate || event.start_datetime,
        endDatetime: event.end_datetime,
        timezone: event.timezone,
        meetingLink: event.meeting_link,
      });
    } catch (icsErr) {
      console.error("ICS generation failed:", icsErr);
      icsBuffer = null;
    }

    // Send confirmation email
    try {
      await sendEventRegistrationEmail({
        name,
        email,
        eventTitle: event.title,
        eventDescription: event.description,
        startDatetime: parsedInstanceDate || event.start_datetime,
        timezone: event.timezone,
        meetingLink: event.meeting_link,
        icsFileBuffer: icsBuffer,
      });

      await pool.query(
        "UPDATE event_registration SET confirmation_sent = TRUE WHERE registration_id = $1",
        [regResult.rows[0].registration_id]
      );
    } catch (emailErr) {
      console.error("Email sending failed:", emailErr);
    }

    // Send WhatsApp message via AiSensy
    // If registering within 1 hour of event, send reminder (with meeting link) instead of confirmation
    try {
      const eventDate = parsedInstanceDate || new Date(event.start_datetime);
      const now = new Date();
      const hoursUntilEvent = (eventDate - now) / (1000 * 60 * 60);

      if (hoursUntilEvent <= 1 && hoursUntilEvent > 0) {
        // Late registration: send reminder with meeting link instead of confirmation
        await sendEventReminder({
          phone,
          name,
          eventTitle: event.title,
          meetingLink: event.meeting_link,
        });
        console.log(
          `[Event] Sent reminder (late registration) to ${phone} for ${event.title}`
        );
      } else {
        // Normal registration: send confirmation
        await sendRegistrationConfirmation({
          phone,
          name,
          eventTitle: event.title,
          eventDate: eventDate.toLocaleDateString("en-IN", {
            timeZone: "Asia/Kolkata",
            weekday: "long",
            day: "numeric",
            month: "short",
          }),
          eventTime: eventDate.toLocaleTimeString("en-IN", {
            timeZone: "Asia/Kolkata",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          }),
        });
      }
    } catch (whatsappErr) {
      console.error("WhatsApp message failed:", whatsappErr);
    }

    try {
      await insertEventRegistrant({
        name,
        email,
        phone,
        eventTitle: event.title,
        registrationDate: new Date().toISOString(),
      });
    } catch (biginErr) {
      console.error("[Bigin] Event registration sync failed:", biginErr);
    }

    res.status(200).json({
      success: true,
      msg: "Registration successful! Check your email and WhatsApp for details.",
      registration: regResult.rows[0],
    });
  } catch (err) {
    console.error("Error in registerForEvent:", err);
    res
      .status(500)
      .json({ msg: "Error registering for event", error: err.message });
  }
}

// GET EVENT REGISTRATIONS - Admin only
async function getEventRegistrations(req, res) {
  const { event_id } = req.params;

  try {
    const query = `
      SELECT 
        er.*,
        u.username,
        e.title AS event_title,
        e.event_type
      FROM event_registration er
      LEFT JOIN app_user u ON er.user_id = u.user_id
      LEFT JOIN event e ON er.event_id = e.event_id
      WHERE er.event_id = $1
      ORDER BY er.instance_date ASC NULLS LAST, er.registered_at DESC
    `;

    const result = await pool.query(query, [event_id]);

    res.status(200).json({
      success: true,
      registrations: result.rows,
    });
  } catch (err) {
    console.error("Error in getEventRegistrations:", err);
    res
      .status(500)
      .json({ msg: "Error fetching registrations", error: err.message });
  }
}

async function subscribeToEvents(req, res) {
  const { email } = req.body;

  try {
    if (!email) {
      return res.status(400).json({ msg: "Email is required" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ msg: "Invalid email format" });
    }

    // Check if already subscribed
    const existing = await pool.query(
      "SELECT * FROM event_subscription WHERE email = $1",
      [email]
    );

    if (existing.rows.length > 0) {
      if (existing.rows[0].is_active) {
        return res.status(400).json({ msg: "Already subscribed" });
      }
      // Reactivate subscription
      await pool.query(
        "UPDATE event_subscription SET is_active = TRUE WHERE email = $1",
        [email]
      );
      return res
        .status(200)
        .json({ success: true, msg: "Subscription reactivated" });
    }

    // Generate unsubscribe token
    const unsubscribeToken = crypto.randomBytes(32).toString("hex");

    await pool.query(
      `INSERT INTO event_subscription (email, unsubscribe_token) VALUES ($1, $2)`,
      [email, unsubscribeToken]
    );

    res.status(201).json({ success: true, msg: "Subscribed successfully" });
  } catch (err) {
    console.error("Error in subscribeToEvents:", err);
    res.status(500).json({ msg: "Error subscribing", error: err.message });
  }
}

// UNSUBSCRIBE FROM EVENTS - Public
async function unsubscribeFromEvents(req, res) {
  const { token } = req.params;

  try {
    const result = await pool.query(
      "UPDATE event_subscription SET is_active = FALSE WHERE unsubscribe_token = $1 RETURNING email",
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ msg: "Invalid unsubscribe link" });
    }

    res.status(200).json({ success: true, msg: "Unsubscribed successfully" });
  } catch (err) {
    console.error("Error in unsubscribeFromEvents:", err);
    res.status(500).json({ msg: "Error unsubscribing", error: err.message });
  }
}

// CREATE INSTANCE OVERRIDE - Admin only
async function createInstanceOverride(req, res) {
  const { event_id } = req.params;
  const { instance_date, custom_start_time, custom_end_time } = req.body;

  try {
    if (!instance_date || !custom_start_time || !custom_end_time) {
      return res.status(400).json({
        msg: "Missing required fields: instance_date, custom_start_time, custom_end_time",
      });
    }

    // Validate instance_date is in the future
    const instanceDateObj = new Date(instance_date);

    const now = new Date();

    now.setHours(0, 0, 0, 0);

    if (instanceDateObj < now) {
      return res
        .status(400)
        .json({ msg: "Can only override future instances" });
    }

    // Check if event exists and is recurring
    const eventCheck = await pool.query(
      "SELECT event_type FROM event WHERE event_id = $1",
      [event_id]
    );

    if (eventCheck.rows.length === 0) {
      return res.status(404).json({ msg: "Event not found" });
    }

    if (eventCheck.rows[0].event_type !== "recurring") {
      return res
        .status(400)
        .json({ msg: "Can only override recurring events" });
    }

    // Insert or update override (UPSERT)
    const query = `
      INSERT INTO event_instance_override (event_id, instance_date, custom_start_time, custom_end_time)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (event_id, instance_date)
      DO UPDATE SET custom_start_time = $3, custom_end_time = $4, created_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const result = await pool.query(query, [
      event_id,
      instance_date,
      custom_start_time,
      custom_end_time,
    ]);

    console.log(
      `[EventController] Created override for event ${event_id} on ${instance_date}: ${custom_start_time}-${custom_end_time}`
    );

    res.status(200).json({
      success: true,
      override: result.rows[0],
    });
  } catch (err) {
    console.error("Error in createInstanceOverride:", err);
    res
      .status(500)
      .json({ msg: "Error creating override", error: err.message });
  }
}

module.exports = {
  createEvent,
  updateEvent,
  deleteEvent,
  getAllEvents,
  getActiveEvents,
  getFeaturedEvent,
  getEventBySlug,
  registerForEvent,
  getEventRegistrations,
  subscribeToEvents,
  unsubscribeFromEvents,
  restoreEvent,
  permanentDeleteEvent,
  createInstanceOverride,
};
