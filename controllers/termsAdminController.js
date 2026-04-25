const crypto = require("crypto");
const { pool } = require("../util/db");
const { uploadTermsBuffer, getTermsDownloadUrl, deleteTermsObject } = require("../services/termsS3Service");
const { sendTermsInviteMail } = require("../services/emailService");
const { TERMS_TOKEN_TTL_HOURS } = require("../config/configuration");

function sanitizeFileName(name = "") {
  return String(name).replace(/[^\w.\-]+/g, "_");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function createInviteToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeFieldKey(value, fallback) {
  const raw = String(value || fallback || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return raw || String(fallback || "").trim() || "field";
}

async function appendEnvelopeEvent(client, envelopeId, eventType, payload = {}) {
  await client.query(
    `INSERT INTO terms_event_log (envelope_id, event_type, event_payload)
     VALUES ($1, $2, $3::jsonb)`,
    [envelopeId, eventType, JSON.stringify(payload || {})],
  );
}

async function listTemplates(req, res) {
  try {
    const adminAccess = req.adminAccess || {};
    const isSuperAdmin = adminAccess.isSuperAdmin;
    const termsScope = adminAccess.terms || {};

    let whereSql = "";
    const params = [];

    if (!isSuperAdmin && !termsScope.has_full_access) {
      if (!termsScope.template_ids || termsScope.template_ids.length === 0) {
        return res.json({ templates: [] });
      }
      params.push(termsScope.template_ids);
      whereSql = "WHERE template_id = ANY($1::uuid[])";
    }

    const result = await pool.query(
      `SELECT template_id, title, description, source_pdf_filename, page_count, status,
              created_by, created_at, updated_at
       FROM terms_template
       ${whereSql}
       ORDER BY updated_at DESC`,
      params
    );
    return res.json({ templates: result.rows });
  } catch (error) {
    console.error("listTemplates error:", error);
    return res.status(500).json({ msg: "Failed to list templates" });
  }
}

async function createTemplate(req, res) {
  try {
    const { title = "", description = "" } = req.body || {};
    if (!isNonEmptyString(title)) {
      return res.status(400).json({ msg: "title is required" });
    }
    if (!req.file || req.file.mimetype !== "application/pdf") {
      return res.status(400).json({ msg: "PDF file is required" });
    }

    const templateId = crypto.randomUUID();
    const safeName = sanitizeFileName(req.file.originalname || "template.pdf");
    const pdfKey = `terms/templates/${templateId}/${Date.now()}_${safeName}`;
    await uploadTermsBuffer({
      key: pdfKey,
      body: req.file.buffer,
      contentType: req.file.mimetype,
      contentDisposition: `inline; filename="${safeName}"`,
      metadata: {
        template_id: templateId,
      },
    });

    const insertResult = await pool.query(
      `INSERT INTO terms_template (
         template_id, title, description, source_pdf_key, source_pdf_filename, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING template_id, title, description, source_pdf_filename, page_count, status, created_at, updated_at`,
      [templateId, title.trim(), String(description || ""), pdfKey, safeName, req.user?.user_id || null],
    );

    return res.status(201).json({ template: insertResult.rows[0] });
  } catch (error) {
    console.error("createTemplate error:", error);
    return res.status(500).json({ msg: "Failed to create template" });
  }
}

async function getTemplateDetail(req, res) {
  try {
    const { templateId } = req.params;
    const templateResult = await pool.query(
      `SELECT template_id, title, description, source_pdf_key, source_pdf_filename, page_count,
              status, created_by, created_at, updated_at
       FROM terms_template
       WHERE template_id = $1`,
      [templateId],
    );
    if (!templateResult.rows.length) {
      return res.status(404).json({ msg: "Template not found" });
    }
    const fieldsResult = await pool.query(
      `SELECT field_id, field_key, field_type, label, placeholder, required, page_number,
              x, y, width, height, field_order, style_json, config_json
       FROM terms_template_field
       WHERE template_id = $1
       ORDER BY page_number ASC, field_order ASC`,
      [templateId],
    );

    const template = templateResult.rows[0];
    const sourcePdfUrl = await getTermsDownloadUrl(template.source_pdf_key);
    return res.json({
      template: {
        ...template,
        source_pdf_url: sourcePdfUrl,
      },
      fields: fieldsResult.rows,
    });
  } catch (error) {
    console.error("getTemplateDetail error:", error);
    return res.status(500).json({ msg: "Failed to fetch template detail" });
  }
}

async function saveTemplateFields(req, res) {
  const { templateId } = req.params;
  const fields = Array.isArray(req.body?.fields) ? req.body.fields : [];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const templateResult = await client.query(
      "SELECT template_id FROM terms_template WHERE template_id = $1",
      [templateId],
    );
    if (!templateResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ msg: "Template not found" });
    }

    const preparedFields = [];
    for (let index = 0; index < fields.length; index += 1) {
      const field = fields[index] || {};
      if (!isNonEmptyString(field.field_type)) continue;
      const fieldKey = normalizeFieldKey(field.field_key, `field_${index + 1}`);
      preparedFields.push({
        ...field,
        field_key: fieldKey,
      });
    }

    await client.query("DELETE FROM terms_template_field WHERE template_id = $1", [templateId]);
    for (let index = 0; index < preparedFields.length; index += 1) {
      const field = preparedFields[index] || {};
      await client.query(
        `INSERT INTO terms_template_field (
           template_id, field_key, field_type, label, placeholder, required,
           page_number, x, y, width, height, field_order, style_json, config_json
         ) VALUES (
           $1, $2, $3, $4, $5, $6,
           $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb
         )`,
        [
          templateId,
          field.field_key,
          String(field.field_type).trim(),
          String(field.label || ""),
          String(field.placeholder || ""),
          Boolean(field.required),
          Number(field.page_number || 1),
          Number(field.x || 0),
          Number(field.y || 0),
          Number(field.width || 0.2),
          Number(field.height || 0.03),
          Number(field.field_order ?? index),
          JSON.stringify(field.style_json || {}),
          JSON.stringify(field.config_json || {}),
        ],
      );
    }

    await client.query(
      `UPDATE terms_template
       SET updated_at = CURRENT_TIMESTAMP
       WHERE template_id = $1`,
      [templateId],
    );
    await client.query("COMMIT");
    return res.json({ success: true, count: preparedFields.length });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("saveTemplateFields error:", error);
    return res.status(500).json({ msg: "Failed to save template fields" });
  } finally {
    client.release();
  }
}

async function updateTemplateStatus(req, res) {
  try {
    const { templateId } = req.params;
    const nextStatus = String(req.body?.status || "").trim();
    if (!["draft", "published", "archived"].includes(nextStatus)) {
      return res.status(400).json({ msg: "Invalid status" });
    }
    const result = await pool.query(
      `UPDATE terms_template
       SET status = $2, updated_at = CURRENT_TIMESTAMP
       WHERE template_id = $1
       RETURNING template_id, status, updated_at`,
      [templateId, nextStatus],
    );
    if (!result.rows.length) {
      return res.status(404).json({ msg: "Template not found" });
    }
    return res.json({ template: result.rows[0] });
  } catch (error) {
    console.error("updateTemplateStatus error:", error);
    return res.status(500).json({ msg: "Failed to update status" });
  }
}

async function sendInvite(req, res) {
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    const { templateId } = req.params;
    const recipientEmail = String(req.body?.recipient_email || "").trim().toLowerCase();
    const recipientName = String(req.body?.recipient_name || "").trim();
    const recipientPhone = String(req.body?.recipient_phone || "").trim();

    if (!recipientEmail || !/^\S+@\S+\.\S+$/.test(recipientEmail)) {
      return res.status(400).json({ msg: "Valid recipient_email is required" });
    }

    const templateResult = await client.query(
      `SELECT template_id, title, status
       FROM terms_template
       WHERE template_id = $1`,
      [templateId],
    );
    if (!templateResult.rows.length) {
      return res.status(404).json({ msg: "Template not found" });
    }
    if (templateResult.rows[0].status !== "published") {
      return res.status(400).json({ msg: "Only published templates can be sent" });
    }

    const token = createInviteToken();
    const tokenHash = hashToken(token);
    const tokenHint = token.slice(0, 8);
    const expiresAt = new Date(Date.now() + TERMS_TOKEN_TTL_HOURS * 60 * 60 * 1000);

    await client.query("BEGIN");
    transactionOpen = true;
    const envelopeResult = await client.query(
      `INSERT INTO terms_envelope (
         template_id, recipient_email, recipient_name, recipient_phone, sender_user_id,
         token_hash, token_hint, status, expires_at, meta_json
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, 'sent', $8, $9::jsonb
       )
       RETURNING envelope_id, recipient_email, recipient_name, status, expires_at, sent_at`,
      [
        templateId,
        recipientEmail,
        recipientName,
        recipientPhone,
        req.user?.user_id || null,
        tokenHash,
        tokenHint,
        expiresAt.toISOString(),
        JSON.stringify({
          sender_name: req.user?.username || "",
        }),
      ],
    );
    const envelope = envelopeResult.rows[0];
    await appendEnvelopeEvent(client, envelope.envelope_id, "sent", {
      sender_user_id: req.user?.user_id || null,
      recipient_email: recipientEmail,
    });
    await client.query("COMMIT");
    transactionOpen = false;

    const baseFrontend = process.env.FRONTEND_URL || "https://app.skillcase.in";
    const signingUrl = `${baseFrontend.replace(/\/+$/, "")}/terms/sign/${token}`;

    try {
      await sendTermsInviteMail({
        to: recipientEmail,
        recipientName,
        templateTitle: templateResult.rows[0].title,
        signingUrl,
        expiresAt,
      });
      await pool.query(
        `INSERT INTO terms_event_log (envelope_id, event_type, event_payload)
         VALUES ($1, 'sent_mail_delivered', $2::jsonb)`,
        [envelope.envelope_id, JSON.stringify({ recipient_email: recipientEmail })],
      );
    } catch (mailError) {
      console.error("sendTermsInviteMail failed:", mailError);
      await pool.query(
        `UPDATE terms_envelope
         SET status = 'cancelled',
             updated_at = CURRENT_TIMESTAMP
         WHERE envelope_id = $1`,
        [envelope.envelope_id],
      );
      await pool.query(
        `INSERT INTO terms_event_log (envelope_id, event_type, event_payload)
         VALUES ($1, 'sent_mail_failed', $2::jsonb)`,
        [
          envelope.envelope_id,
          JSON.stringify({ error: mailError?.message || "unknown" }),
        ],
      );
      return res.status(500).json({ msg: "Invite email failed to send" });
    }

    return res.status(201).json({
      envelope: {
        ...envelope,
        signing_url: signingUrl,
      },
    });
  } catch (error) {
    if (transactionOpen) {
      await client.query("ROLLBACK");
    }
    console.error("sendInvite error:", error);
    return res.status(500).json({ msg: "Failed to send invite" });
  } finally {
    client.release();
  }
}

async function listEnvelopes(req, res) {
  try {
    const adminAccess = req.adminAccess || {};
    const isSuperAdmin = adminAccess.isSuperAdmin;
    const termsScope = adminAccess.terms || {};

    const templateId = req.query.template_id ? String(req.query.template_id) : null;
    const status = req.query.status ? String(req.query.status) : null;
    const values = [];
    const where = [];

    if (!isSuperAdmin && !termsScope.has_full_access) {
      if (!termsScope.template_ids || termsScope.template_ids.length === 0) {
        return res.json({ envelopes: [] });
      }
      values.push(termsScope.template_ids);
      where.push(`e.template_id = ANY($${values.length}::uuid[])`);
    }

    if (templateId) {
      values.push(templateId);
      where.push(`e.template_id = $${values.length}`);
    }
    if (status) {
      values.push(status);
      where.push(`e.status = $${values.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const result = await pool.query(
      `SELECT e.envelope_id, e.document_id, e.template_id, t.title AS template_title, e.recipient_email,
              e.recipient_name, e.recipient_phone, e.status, e.expires_at, e.sent_at, e.viewed_at, e.signed_at,
              e.signed_pdf_key, e.signed_pdf_filename, e.created_at
       FROM terms_envelope e
       INNER JOIN terms_template t ON t.template_id = e.template_id
       ${whereSql}
       ORDER BY e.created_at DESC
       LIMIT 500`,
      values,
    );
    return res.json({ envelopes: result.rows });
  } catch (error) {
    console.error("listEnvelopes error:", error);
    return res.status(500).json({ msg: "Failed to list envelopes" });
  }
}

async function getEnvelopeDetail(req, res) {
  try {
    const { envelopeId } = req.params;
    const envelopeResult = await pool.query(
      `SELECT e.*, t.title AS template_title
       FROM terms_envelope e
       INNER JOIN terms_template t ON t.template_id = e.template_id
       WHERE e.envelope_id = $1`,
      [envelopeId],
    );
    if (!envelopeResult.rows.length) {
      return res.status(404).json({ msg: "Envelope not found" });
    }
    const envelope = envelopeResult.rows[0];

    const [eventsResult, submissionResult] = await Promise.all([
      pool.query(
        `SELECT event_id, event_type, event_payload, created_at
         FROM terms_event_log
         WHERE envelope_id = $1
         ORDER BY created_at ASC`,
        [envelopeId],
      ),
      pool.query(
        `SELECT submission_id, field_values_json, signature_mode, signature_asset_key,
                typed_signature_font, audit_json, created_at
         FROM terms_submission
         WHERE envelope_id = $1`,
        [envelopeId],
      ),
    ]);

    const signedPdfUrl = envelope.signed_pdf_key
      ? await getTermsDownloadUrl(envelope.signed_pdf_key)
      : null;

    return res.json({
      envelope: {
        ...envelope,
        signed_pdf_url: signedPdfUrl,
      },
      submission: submissionResult.rows[0] || null,
      events: eventsResult.rows,
    });
  } catch (error) {
    console.error("getEnvelopeDetail error:", error);
    return res.status(500).json({ msg: "Failed to fetch envelope detail" });
  }
}

async function deleteTemplate(req, res) {
  try {
    const { templateId } = req.params;
    const envelopeCountResult = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM terms_envelope
       WHERE template_id = $1`,
      [templateId],
    );
    const linkedEnvelopes = envelopeCountResult.rows[0]?.count || 0;
    if (linkedEnvelopes > 0) {
      return res.status(409).json({
        msg: "Template cannot be deleted after invites are created. Archive it instead.",
      });
    }

    // Fetch the S3 key before deleting the DB row so we can clean up storage.
    const keyResult = await pool.query(
      "SELECT source_pdf_key FROM terms_template WHERE template_id = $1",
      [templateId],
    );
    if (!keyResult.rows.length) {
      return res.status(404).json({ msg: "Template not found" });
    }
    const sourcePdfKey = keyResult.rows[0].source_pdf_key;

    const result = await pool.query(
      `DELETE FROM terms_template
       WHERE template_id = $1
       RETURNING template_id`,
      [templateId],
    );
    if (!result.rows.length) {
      return res.status(404).json({ msg: "Template not found" });
    }

    // Best-effort S3 cleanup — log but do not fail the request if it errors.
    if (sourcePdfKey) {
      deleteTermsObject(sourcePdfKey).catch((s3Err) => {
        console.error("deleteTemplate: failed to remove S3 object", sourcePdfKey, s3Err);
      });
    }

    return res.json({ success: true, template_id: templateId });
  } catch (error) {
    console.error("deleteTemplate error:", error);
    return res.status(500).json({ msg: "Failed to delete template" });
  }
}

module.exports = {
  listTemplates,
  createTemplate,
  getTemplateDetail,
  saveTemplateFields,
  updateTemplateStatus,
  sendInvite,
  listEnvelopes,
  getEnvelopeDetail,
  deleteTemplate,
};
