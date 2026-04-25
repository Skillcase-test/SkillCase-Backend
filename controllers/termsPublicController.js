const crypto = require("crypto");
const { pool } = require("../util/db");
const {
  getTermsDownloadUrl,
  getTermsObjectBuffer,
  uploadTermsBuffer,
} = require("../services/termsS3Service");
const { generateSignedTermsPdf } = require("../services/termsPdfService");
const { sendSignedTermsMail } = require("../services/emailService");

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function normalizeString(value) {
  return String(value == null ? "" : value).trim();
}

function normalizeFieldValue(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return String(value);
  return normalizeString(value);
}

function getValueCaseInsensitive(source, key) {
  const target = normalizeString(key).toLowerCase();
  if (!target || !source || typeof source !== "object") return "";
  for (const [entryKey, entryValue] of Object.entries(source)) {
    if (normalizeString(entryKey).toLowerCase() === target) {
      return normalizeFieldValue(entryValue);
    }
  }
  return "";
}

function getFieldDefaultValue(field) {
  const config = field?.config_json && typeof field.config_json === "object"
    ? field.config_json
    : {};
  if (!Object.prototype.hasOwnProperty.call(config, "default_value")) {
    return field?.field_type === "checkbox" ? false : "";
  }
  const rawDefault = config.default_value;
  if (field?.field_type === "checkbox") {
    return rawDefault === true || rawDefault === "true" || rawDefault === 1 || rawDefault === "1";
  }
  return normalizeFieldValue(rawDefault);
}

function getEffectiveFieldValue(field, fieldValues) {
  const key = String(field?.field_key || "");
  if (!key) return field?.field_type === "checkbox" ? false : "";
  const hasPayloadValue = Object.prototype.hasOwnProperty.call(fieldValues, key);
  if (!hasPayloadValue) return getFieldDefaultValue(field);
  const payloadValue = fieldValues[key];
  if (field?.field_type === "checkbox") {
    return payloadValue === true;
  }
  const normalized = normalizeFieldValue(payloadValue);
  if (normalized) return normalized;
  return getFieldDefaultValue(field);
}

function isSignatureFieldUserRequired(field) {
  if (field?.field_type !== "signature" || !field?.required) return false;
  const config = field?.config_json && typeof field.config_json === "object"
    ? field.config_json
    : {};
  const locked = Boolean(config.locked);
  const hasDefaultText = normalizeString(config.default_value).length > 0;
  const hasDefaultImage = normalizeString(config.default_signature_image_data_url).startsWith("data:image/");
  return !(locked && (hasDefaultText || hasDefaultImage));
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:(.+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

function isEnvelopeExpired(envelope) {
  return new Date(envelope.expires_at).getTime() < Date.now();
}

async function fetchEnvelopeWithTemplateByToken(tokenHash) {
  const result = await pool.query(
    `SELECT e.envelope_id, e.template_id, e.recipient_email, e.recipient_name, e.recipient_phone,
            e.status, e.expires_at, e.sent_at, e.viewed_at, e.signed_at, e.signed_pdf_key,
            t.title AS template_title, t.description AS template_description, t.source_pdf_key,
            t.source_pdf_filename, t.page_count, t.status AS template_status
     FROM terms_envelope e
     INNER JOIN terms_template t ON t.template_id = e.template_id
     WHERE e.token_hash = $1`,
    [tokenHash],
  );
  return result.rows[0] || null;
}

async function appendEnvelopeEvent(client, envelopeId, eventType, payload = {}) {
  await client.query(
    `INSERT INTO terms_event_log (envelope_id, event_type, event_payload)
     VALUES ($1, $2, $3::jsonb)`,
    [envelopeId, eventType, JSON.stringify(payload || {})],
  );
}

function validateRequiredFields(fields, fieldValues) {
  const missing = [];
  for (const field of fields) {
    if (!field.required) continue;
    if (field.field_type === "label") continue;
    if (field.field_type === "signature") continue;
    const key = String(field.field_key || "");
    const raw = getEffectiveFieldValue(field, fieldValues);
    if (field.field_type === "checkbox") {
      if (raw !== true) missing.push(key);
      continue;
    }
    if (!normalizeString(raw)) missing.push(key);
  }
  return missing;
}

async function resolveInvite(req, res) {
  try {
    const token = String(req.params.token || "").trim();
    if (!token) return res.status(400).json({ msg: "Missing token" });
    const tokenHash = hashToken(token);

    const envelope = await fetchEnvelopeWithTemplateByToken(tokenHash);
    if (!envelope) {
      return res.status(404).json({ msg: "Invite not found" });
    }
    if (envelope.status === "cancelled") {
      return res.status(410).json({ msg: "Invite is cancelled" });
    }
    if (isEnvelopeExpired(envelope) && envelope.status !== "signed") {
      await pool.query(
        `UPDATE terms_envelope
         SET status = 'expired', updated_at = CURRENT_TIMESTAMP
         WHERE envelope_id = $1 AND status <> 'signed'`,
        [envelope.envelope_id],
      );
      return res.status(410).json({ msg: "Invite expired" });
    }

    const fieldsResult = await pool.query(
      `SELECT field_id, field_key, field_type, label, placeholder, required, page_number,
              x, y, width, height, field_order, style_json, config_json
       FROM terms_template_field
       WHERE template_id = $1
       ORDER BY page_number ASC, field_order ASC`,
      [envelope.template_id],
    );
    const sourcePdfUrl = await getTermsDownloadUrl(envelope.source_pdf_key);

    if (!envelope.viewed_at && envelope.status === "sent") {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `UPDATE terms_envelope
           SET viewed_at = CURRENT_TIMESTAMP,
               status = 'viewed',
               updated_at = CURRENT_TIMESTAMP
           WHERE envelope_id = $1 AND status = 'sent'`,
          [envelope.envelope_id],
        );
        await appendEnvelopeEvent(client, envelope.envelope_id, "viewed", {
          ip: req.ip,
          user_agent: req.headers["user-agent"] || "",
        });
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    }

    return res.json({
      envelope: {
        envelope_id: envelope.envelope_id,
        recipient_email: envelope.recipient_email,
        recipient_name: envelope.recipient_name,
        recipient_phone: envelope.recipient_phone,
        status: envelope.status,
        expires_at: envelope.expires_at,
      },
      template: {
        template_id: envelope.template_id,
        title: envelope.template_title,
        description: envelope.template_description,
        source_pdf_filename: envelope.source_pdf_filename,
        page_count: envelope.page_count,
        source_pdf_url: sourcePdfUrl,
      },
      fields: fieldsResult.rows,
    });
  } catch (error) {
    console.error("resolveInvite error:", error);
    return res.status(500).json({ msg: "Failed to resolve invite" });
  }
}

async function submitSignedDocument(req, res) {
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    const token = String(req.params.token || "").trim();
    if (!token) return res.status(400).json({ msg: "Missing token" });
    const tokenHash = hashToken(token);
    const fieldValuesInput =
      req.body?.field_values && typeof req.body.field_values === "object"
        ? req.body.field_values
        : {};
    const signatureMode = String(req.body?.signature_mode || "typed").trim();
    if (!["typed", "drawn", "uploaded"].includes(signatureMode)) {
      return res.status(400).json({ msg: "Invalid signature_mode" });
    }

    const envelope = await fetchEnvelopeWithTemplateByToken(tokenHash);
    if (!envelope) return res.status(404).json({ msg: "Invite not found" });
    if (envelope.status === "signed") {
      return res.status(409).json({ msg: "Document already signed" });
    }
    if (envelope.status === "cancelled") {
      return res.status(410).json({ msg: "Invite is cancelled" });
    }
    if (isEnvelopeExpired(envelope)) {
      return res.status(410).json({ msg: "Invite expired" });
    }

    const fieldsResult = await pool.query(
      `SELECT field_id, field_key, field_type, label, placeholder, required, page_number,
              x, y, width, height, field_order, style_json, config_json
       FROM terms_template_field
       WHERE template_id = $1
       ORDER BY page_number ASC, field_order ASC`,
      [envelope.template_id],
    );
    const fields = fieldsResult.rows;
    const fieldValues = {};
    Object.keys(fieldValuesInput).forEach((key) => {
      fieldValues[key] = normalizeFieldValue(fieldValuesInput[key]);
    });
    const effectiveFieldValues = {};
    fields.forEach((field) => {
      const key = String(field.field_key || "");
      if (!key) return;
      effectiveFieldValues[key] = getEffectiveFieldValue(field, fieldValues);
    });
    const missing = validateRequiredFields(fields, fieldValues);
    if (missing.length) {
      return res.status(400).json({
        msg: "Missing required fields",
        missing_fields: missing,
      });
    }
    const signatureImageDataUrl = String(req.body?.signature_image_data_url || "").trim();
    const parsedSignatureImage = signatureImageDataUrl
      ? parseDataUrl(signatureImageDataUrl)
      : null;
    if (
      signatureImageDataUrl &&
      (!parsedSignatureImage ||
        !["image/png", "image/jpeg", "image/jpg"].includes(parsedSignatureImage.mimeType))
    ) {
      return res.status(400).json({ msg: "Invalid signature image format" });
    }
    // H2: prevent DoS via oversized base64 signature images (cap at 5 MB decoded)
    const SIGNATURE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
    if (parsedSignatureImage && parsedSignatureImage.buffer.length > SIGNATURE_IMAGE_MAX_BYTES) {
      return res.status(400).json({ msg: "Signature image exceeds the 5 MB size limit" });
    }

    const requiresSignature = fields.some((field) => isSignatureFieldUserRequired(field));
    const signatureFieldKeys = fields
      .filter((field) => isSignatureFieldUserRequired(field))
      .map((field) => String(field.field_key || "").trim())
      .filter(Boolean);
    const signatureTextFromMappedFields = signatureFieldKeys.find((key) =>
      normalizeString(getValueCaseInsensitive(effectiveFieldValues, key)),
    );
    const signatureTextFallback = [
      getValueCaseInsensitive(effectiveFieldValues, "signature"),
      getValueCaseInsensitive(effectiveFieldValues, "full_name"),
      getValueCaseInsensitive(effectiveFieldValues, "name"),
      getValueCaseInsensitive(effectiveFieldValues, "candidate_name"),
    ].find((value) => normalizeString(value));
    const hasTypedSignatureText = Boolean(
      normalizeString(signatureTextFromMappedFields) ||
        normalizeString(signatureTextFallback),
    );
    if (
      requiresSignature &&
      ((signatureMode === "typed" &&
        !hasTypedSignatureText &&
        !signatureImageDataUrl) ||
        ((signatureMode === "drawn" || signatureMode === "uploaded") &&
          !signatureImageDataUrl))
    ) {
      return res.status(400).json({ msg: "Signature is required" });
    }

    let signatureAssetKey = null;
    if (parsedSignatureImage) {
      const ext = parsedSignatureImage.mimeType === "image/png" ? "png" : "jpg";
      signatureAssetKey = `terms/signatures/${envelope.envelope_id}/${Date.now()}_signature.${ext}`;
      await uploadTermsBuffer({
        key: signatureAssetKey,
        body: parsedSignatureImage.buffer,
        contentType: parsedSignatureImage.mimeType,
      });
    }

    const sourcePdfBuffer = await getTermsObjectBuffer(envelope.source_pdf_key);
    const signedPdfBytes = await generateSignedTermsPdf({
      sourcePdfBuffer,
      fields,
      fieldValues: effectiveFieldValues,
      envelope,
      signatureMode,
      signatureImageDataUrl,
      documentId: token,
    });
    const signedPdfBuffer = Buffer.from(signedPdfBytes);
    const safeTitle = normalizeString(envelope.template_title).replace(/[^\w.\-]+/g, "_") || "Terms";
    const signedFileName = `${safeTitle}_${Date.now()}_signed.pdf`;
    const signedPdfKey = `terms/signed/${envelope.envelope_id}/${signedFileName}`;
    await uploadTermsBuffer({
      key: signedPdfKey,
      body: signedPdfBuffer,
      contentType: "application/pdf",
      contentDisposition: `attachment; filename="${signedFileName}"`,
      metadata: {
        envelope_id: envelope.envelope_id,
      },
    });

    const auditPayload = {
      ip: req.ip,
      user_agent: req.headers["user-agent"] || "",
      signed_at: new Date().toISOString(),
      signature_mode: signatureMode,
    };

    await client.query("BEGIN");
    transactionOpen = true;
    await client.query(
      `UPDATE terms_envelope
       SET status = 'signed',
           signed_at = CURRENT_TIMESTAMP,
           signed_pdf_key = $2,
           signed_pdf_filename = $3,
           document_id = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE envelope_id = $1`,
      [envelope.envelope_id, signedPdfKey, signedFileName, token],
    );

    await client.query(
      `INSERT INTO terms_submission (
         envelope_id, field_values_json, signature_mode, signature_asset_key, typed_signature_font, audit_json
       ) VALUES (
         $1, $2::jsonb, $3, $4, $5, $6::jsonb
       )
       ON CONFLICT (envelope_id)
       DO UPDATE SET
         field_values_json = EXCLUDED.field_values_json,
         signature_mode = EXCLUDED.signature_mode,
         signature_asset_key = EXCLUDED.signature_asset_key,
         typed_signature_font = EXCLUDED.typed_signature_font,
         audit_json = EXCLUDED.audit_json`,
      [
        envelope.envelope_id,
        JSON.stringify(effectiveFieldValues),
        signatureMode,
        signatureAssetKey,
        signatureMode === "typed" ? "auto_variant" : null,
        JSON.stringify(auditPayload),
      ],
    );
    await appendEnvelopeEvent(client, envelope.envelope_id, "signed", auditPayload);
    await client.query("COMMIT");
    transactionOpen = false;

    try {
      await sendSignedTermsMail({
        to: envelope.recipient_email,
        recipientName: envelope.recipient_name,
        templateTitle: envelope.template_title,
        pdfBuffer: signedPdfBuffer,
        pdfFileName: signedFileName,
      });
    } catch (mailError) {
      console.error("sendSignedTermsMail failed:", mailError);
      await pool.query(
        `INSERT INTO terms_event_log (envelope_id, event_type, event_payload)
         VALUES ($1, 'signed_mail_failed', $2::jsonb)`,
        [
          envelope.envelope_id,
          JSON.stringify({ error: mailError?.message || "unknown" }),
        ],
      );
    }

    const signedPdfUrl = await getTermsDownloadUrl(signedPdfKey);
    return res.json({
      success: true,
      envelope_id: envelope.envelope_id,
      document_id: token,
      signed_pdf_url: signedPdfUrl,
    });
  } catch (error) {
    if (transactionOpen) {
      await client.query("ROLLBACK");
    }
    console.error("submitSignedDocument error:", error);
    return res.status(500).json({ msg: "Failed to submit signed document" });
  } finally {
    client.release();
  }
}

module.exports = {
  resolveInvite,
  submitSignedDocument,
};
