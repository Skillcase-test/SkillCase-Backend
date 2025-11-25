const sendConfirmationMail = require("../services/emailService");
const generateAgreementPdf = require("../services/pdfService");
const { pool } = require("../util/db");

const submit = async (req, res) => {
  try {
    const { email, name, phoneNumber, agree } = req.body;

    if (!name || !email || !phoneNumber) {
      return res.status(400).json({
        ok: false,
        message: "Name, email and phone number are required!",
      });
    }

    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        ok: false,
        message: "Invalid email format",
      });
    }

    // Check existing record
    const checkQuery = `
      SELECT * FROM agreement WHERE email = $1 OR phone_number = $2
    `;

    const exists = await pool.query(checkQuery, [email, phoneNumber]);

    if (exists.rows.length > 0) {
      return res.status(409).json({
        ok: false,
        message:
          "This phone number or email has already submitted the agreement.",
      });
    }

    // Insert record
    const insertQuery = `
      INSERT INTO agreement (name, email, phone_number, agree)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    const result = await pool.query(insertQuery, [
      name,
      email,
      phoneNumber,
      agree,
    ]);

    const newAgreement = result.rows[0];

    // Generate PDF
    const pdfBuffer = await generateAgreementPdf({
      name,
      email,
      phoneNumber,
      date: newAgreement.created_at,
    });

    // Send confirmation email
    let confirmation;
    try {
      confirmation = await sendConfirmationMail(email, name, pdfBuffer);
    } catch (emailError) {
      console.error("Email sending failed:", emailError.message);

      // Rollback -> delete inserted record
      await pool.query("DELETE FROM agreement WHERE agreement_id = $1", [
        newAgreement.agreement_id,
      ]);

      return res.status(500).json({
        ok: false,
        message:
          "Agreement saved temporarily but email failed. Please try again.",
      });
    }

    if (!confirmation.ok) {
      // Rollback if email service returns { ok: false }
      await pool.query("DELETE FROM agreement WHERE agreement_id = $1", [
        newAgreement.agreement_id,
      ]);

      return res.status(500).json({
        ok: false,
        message: "Unable to send confirmation email. Please try again.",
      });
    }

    return res.status(201).json({
      ok: true,
      message: "Agreement submitted and confirmation email sent!",
    });
  } catch (error) {
    console.error("Error in submit controller:", error.message);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error!" });
  }
};

const getAllAgreements = async (req, res) => {
  try {
    const query = `
      SELECT 
        agreement_id,
        name,
        phone_number,
        email,
        agree,
        created_at,
        modified_at
      FROM agreement
      ORDER BY created_at DESC
    `;

    const result = await pool.query(query);

    return res.status(200).json({
      count: result.rows.length,
      agreements: result.rows,
    });
  } catch (error) {
    console.error("Error in getAllAgreements:", error.message);
    return res.status(500).json({ message: "Internal server error!" });
  }
};

module.exports = { submit, getAllAgreements };
