const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

const sendConfirmationMail = async (to, name, pdfBuffer) => {
  try {
    const mailOptions = {
      from: {
        name: "SkillCase Education",
        address: process.env.EMAIL_USER,
      },

      to: to,

      subject:
        "Terms & Conditions Agreement Confirmation - Skillcase Education",

      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #163B72; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f9f9f9; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
            .button { background-color: #EDB843; color: #163B72; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Skillcase Education</h1>
            </div>
            <div class="content">
              <h2>Dear ${name},</h2>
              <p>Thank you for agreeing to the Terms and Conditions of Skillcase Education Private Limited.</p>
              <p>This email confirms that you have successfully accepted our Student Training Agreement and Declaration.</p>
              <p><strong>What's Next?</strong></p>
              <ul>
                <li>Your agreement has been recorded in our system</li>
                <li>A PDF copy of your signed agreement is attached to this email</li>
                <li>Please keep this email for your records</li>
              </ul>
              <p>If you have any questions or concerns, please don't hesitate to contact us.</p>
              <p>We look forward to supporting you on your learning journey!</p>
              <br>
              <p>Best regards,<br><strong>Skillcase Education Team</strong></p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} Skillcase Education Private Limited. All rights reserved.</p>
              <p>This is an automated email. Please do not reply to this message.</p>
            </div>
          </div>
        </body>
        </html>
      `,

      attachments: [
        {
          filename: `SkillCase_Agreement_${name.replace(/\s+/g, "_")}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Mail sent successfully: ", info.messageId);

    return { ok: true, messageId: info.messageId };
  } catch (error) {
    console.log("Error in sendConfirmationMail service: ", error.message);
    throw error;
  }
};

const sendEventRegistrationEmail = async (registrationData) => {
  try {
    const {
      name,
      email,
      eventTitle,
      eventDescription,
      startDatetime,
      timezone,
      meetingLink,
      icsFileBuffer,
    } = registrationData;

    // Simple markdown to HTML converter for emails
    const parseMarkdownForEmail = (text) => {
      if (!text) return "";
      return (
        text
          // Bold: **text** or __text__
          .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
          .replace(/__(.+?)__/g, "<strong>$1</strong>")
          // Italic: *text* or _text_
          .replace(/\*(.+?)\*/g, "<em>$1</em>")
          .replace(/_(.+?)_/g, "<em>$1</em>")
          // Links: [text](url)
          .replace(
            /\[([^\]]+)\]\(([^)]+)\)/g,
            '<a href="$2" style="color: #163B72;">$1</a>',
          )
          // Double newline to paragraph break
          .replace(/\n\n/g, "</p><p>")
          // Single newline to <br>
          .replace(/\n/g, "<br>")
          // Wrap in paragraph
          .replace(/^/, "<p>")
          .replace(/$/, "</p>")
      );
    };

    // Format datetime for display
    const eventDate = new Date(startDatetime);
    const formattedDateTime = eventDate.toLocaleString("en-IN", {
      timeZone: timezone,
      dateStyle: "full",
      timeStyle: "short",
    });

    const formattedDescription = eventDescription
      ? parseMarkdownForEmail(eventDescription)
      : "<p><em>No description provided</em></p>";

    const mailOptions = {
      from: {
        name: "Skillcase Events",
        address: process.env.EMAIL_USER,
      },
      to: email,
      subject: `Registration Confirmed - ${eventTitle}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #163B72; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f9f9f9; }
            .event-details { background: white; padding: 15px; margin: 15px 0; border-left: 4px solid #EDB843; }
            .event-description { margin-top: 10px; color: #555; }
            .event-description p { margin: 0 0 10px 0; }
           .meeting-link { background-color: #EDB843; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; margin: 10px 0; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ You're Registered!</h1>
            </div>
            <div class="content">
              <h2>Hi ${name},</h2>
              <p>Great news! You're successfully registered for:</p>
              
              <div class="event-details">
                <h3>📅 ${eventTitle}</h3>
                <p><strong>Date & Time:</strong> ${formattedDateTime}</p>
                <div class="event-description">
                  <strong>About:</strong>
                  ${formattedDescription}
                </div>
              </div>
              <p><strong>Join the event:</strong></p>
              <a href="${meetingLink}" class="meeting-link">Join Google Meet</a>
              <p style="margin-top: 20px;">📎 <strong>Calendar Invite:</strong> A calendar invite is attached to this email. Add it to your calendar to never miss the event!</p>
              <p style="margin-top: 20px;">We're looking forward to seeing you there!</p>
              
              <br>
              <p>Best regards,<br><strong>Skillcase Team</strong></p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} Skillcase Education Private Limited. All rights reserved.</p>
              <p>This is an automated email. Please do not reply to this message.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      attachments: [
        {
          filename: `${eventTitle.replace(/[^a-z0-9]/gi, "_")}.ics`,
          content: icsFileBuffer,
          contentType: "text/calendar",
        },
      ],
    };
    const info = await transporter.sendMail(mailOptions);
    console.log("Event registration email sent successfully: ", info.messageId);
    return { ok: true, messageId: info.messageId };
  } catch (error) {
    console.log("Error in sendEventRegistrationEmail service: ", error.message);
    throw error;
  }
};

const sendNewEventNotification = async (
  subscriberEmail,
  eventData,
  unsubscribeToken,
) => {
  const { title, description, startDatetime, timezone, coverImageUrl, slug } =
    eventData;

  const eventDate = new Date(startDatetime).toLocaleString("en-IN", {
    timeZone: timezone || "Asia/Kolkata",
    dateStyle: "full",
    timeStyle: "short",
  });

  const eventUrl = `${
    process.env.FRONTEND_URL || "https://app.skillcase.in"
  }/events/${slug}`;
  const unsubscribeUrl = `${
    process.env.BACKEND_URL || "https://api.skillcase.in"
  }/events/unsubscribe/${unsubscribeToken}`;

  const mailOptions = {
    from: { name: "Skillcase Events", address: process.env.EMAIL_USER },
    to: subscriberEmail,
    subject: `🎉 New Event: ${title}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #163B72; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .event-card { background: white; border-radius: 12px; overflow: hidden; margin: 15px 0; }
          .event-image { width: 100%; height: 200px; object-fit: cover; }
          .event-details { padding: 15px; }
          .cta-button { background-color: #EDB843; color: #163B72; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header"><h1>🎉 New Event Added!</h1></div>
          <div class="content">
            <div class="event-card">
              ${
                coverImageUrl
                  ? `<img src="${coverImageUrl}" alt="${title}" class="event-image">`
                  : ""
              }
              <div class="event-details">
                <h2>${title}</h2>
                <p>📅 ${eventDate}</p>
                <p>${description || ""}</p>
              </div>
            </div>
            <div style="text-align: center; margin-top: 20px;">
              <a href="${eventUrl}" class="cta-button">View Event & Register</a>
            </div>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} Skillcase Education. All rights reserved.</p>
            <p><a href="${unsubscribeUrl}">Unsubscribe</a> from event notifications</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    return { ok: true, messageId: info.messageId };
  } catch (error) {
    console.error("Error sending new event notification:", error.message);
    throw error;
  }
};

const sendTermsInviteMail = async ({
  to,
  recipientName,
  templateTitle,
  signingUrl,
}) => {
  const sentDate = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const agreementName = templateTitle || "Terms & Conditions";

  const mailOptions = {
    from: {
      name: "Skillcase",
      address: process.env.EMAIL_USER,
    },
    to,
    subject: "Agreement Signing Request",
    html: `
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6; padding:20px 0;">
  <tr>
    <td align="center">

      <!-- Main Card -->
      <table width="520" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff; border-radius:10px; border:1px solid #e5e7eb; font-family:'Segoe UI', Tahoma, Arial, sans-serif; color:#1f2937; overflow:hidden;">
        
        <!-- Header -->
        <tr>
          <td style="background:#163B72; color:#ffffff; padding:16px 20px; font-size:18px; font-weight:600;">
            Agreement Signing Request
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:24px; line-height:1.6;">
            
            <p style="margin:0 0 12px 0;">
              The Skillcase Team has requested you to review and sign 
              <strong style="color:#163B72;">${agreementName}</strong>.
            </p>

            <p style="margin:0 0 18px 0;">
              Please read the document carefully before proceeding with the signing process.
            </p>

            <!-- Info Box -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb; border-radius:8px; margin-bottom:20px;">
              <tr>
                <td style="padding:14px 16px;">
                  <p style="margin:4px 0;"><strong>Sender:</strong> Skillcase</p>
                  <p style="margin:4px 0;"><strong>Date:</strong> ${sentDate}</p>
                  <p style="margin:4px 0;"><strong>Agreement:</strong> ${agreementName}</p>
                </td>
              </tr>
            </table>

            <!-- Button -->
            <table align="center" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center">
                  <a href="${signingUrl}" 
                     style="display:inline-block; background:#163B72; color:#ffffff; padding:12px 22px; border-radius:8px; text-decoration:none; font-weight:600;">
                    Start Signing
                  </a>
                </td>
              </tr>
            </table>

          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>
    `,
  };

  const info = await transporter.sendMail(mailOptions);
  return { ok: true, messageId: info.messageId };
};

const sendSignedTermsMail = async ({
  to,
  recipientName,
  templateTitle,
  pdfBuffer,
  pdfFileName,
}) => {
  const safeName = (pdfFileName || "Skillcase_Signed_Terms.pdf").replace(
    /[^\w.\-]/g,
    "_",
  );
  const mailOptions = {
    from: {
      name: "Skillcase",
      address: process.env.EMAIL_USER,
    },
    to,
    subject: `Signed Copy: ${templateTitle || "Terms & Conditions"}`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
        <h2 style="margin-bottom: 4px;">Hello ${recipientName || "there"},</h2>
        <p>Your document has been signed successfully.</p>
        <p>Attached is the final signed PDF for your records.</p>
        <p style="margin-top: 16px;">Skillcase Team</p>
      </div>
    `,
    attachments: [
      {
        filename: safeName,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  };

  const info = await transporter.sendMail(mailOptions);
  return { ok: true, messageId: info.messageId };
};

// Notify all active subscribers about a new event
const notifySubscribersNewEvent = async (eventData, pool) => {
  try {
    const subscribers = await pool.query(
      "SELECT email, unsubscribe_token FROM event_subscription WHERE is_active = TRUE",
    );

    const results = await Promise.allSettled(
      subscribers.rows.map((sub) =>
        sendNewEventNotification(sub.email, eventData, sub.unsubscribe_token),
      ),
    );

    const sent = results.filter((r) => r.status === "fulfilled").length;
    console.log(
      `Sent ${sent}/${subscribers.rows.length} new event notifications`,
    );
    return { sent, total: subscribers.rows.length };
  } catch (err) {
    console.error("Error notifying subscribers:", err);
    return { sent: 0, total: 0 };
  }
};

module.exports = {
  sendConfirmationMail,
  sendEventRegistrationEmail,
  sendNewEventNotification,
  notifySubscribersNewEvent,
  sendTermsInviteMail,
  sendSignedTermsMail,
};
