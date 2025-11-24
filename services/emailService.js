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

module.exports = sendConfirmationMail;
