const { PDFDocument, StandardFonts, rgb, degrees } = require("pdf-lib");

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function normalizeString(value) {
  if (value == null) return "";
  return String(value).trim();
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:(.+);base64,(.+)$/);
  if (!match) return null;
  const mimeType = match[1];
  const data = Buffer.from(match[2], "base64");
  return { mimeType, data };
}

function fitImageIntoBox(imageWidth, imageHeight, boxX, boxY, boxWidth, boxHeight) {
  const safeImageWidth = Math.max(1, Number(imageWidth) || 1);
  const safeImageHeight = Math.max(1, Number(imageHeight) || 1);
  const padding = Math.min(1, boxWidth * 0.015, boxHeight * 0.08);
  const innerWidth = Math.max(1, boxWidth - padding * 2);
  const innerHeight = Math.max(1, boxHeight - padding * 2);
  const scale = Math.min(innerWidth / safeImageWidth, innerHeight / safeImageHeight);
  const width = Math.max(1, safeImageWidth * scale);
  const height = Math.max(1, safeImageHeight * scale);
  const x = boxX + (boxWidth - width) / 2;
  const y = boxY + (boxHeight - height) / 2;
  return { x, y, width, height };
}

function pickTypedSignatureStyle(seed = "") {
  const normalized = String(seed || "");
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  }
  const variants = [
    { font: StandardFonts.HelveticaOblique, sizeFactor: 0.95, angle: -3, color: rgb(0.1, 0.1, 0.1) },
    { font: StandardFonts.TimesRomanItalic, sizeFactor: 1.0, angle: 1, color: rgb(0.06, 0.06, 0.2) },
    { font: StandardFonts.CourierOblique, sizeFactor: 0.92, angle: -1, color: rgb(0.08, 0.08, 0.08) },
  ];
  return variants[hash % variants.length];
}

function resolveSignatureValue(envelope, fieldValues, fallback = "") {
  if (!fieldValues || typeof fieldValues !== "object") return fallback;
  const candidates = ["signature", "Signature", "full_name", "Full_Name", "name", "Name", "candidate_name", "Candidate_Name"];
  for (const key of candidates) {
    const value = normalizeString(fieldValues[key]);
    if (value) return value;
  }
  for (const [key, value] of Object.entries(fieldValues)) {
    if (String(key || "").trim().toLowerCase() === "signature") {
      const normalized = normalizeString(value);
      if (normalized) return normalized;
    }
  }
  return fallback;
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
  return normalizeString(rawDefault);
}

function getTextForField(field, fieldValues) {
  const key = field.field_key;
  if (!key) return "";
  if (field.field_type === "checkbox") {
    const hasValue = Object.prototype.hasOwnProperty.call(fieldValues, key);
    const effectiveValue = hasValue ? fieldValues[key] : getFieldDefaultValue(field);
    return effectiveValue ? "X" : "";
  }
  const payloadValue = normalizeString(fieldValues[key]);
  if (payloadValue) return payloadValue;
  return normalizeString(getFieldDefaultValue(field));
}

async function generateSignedTermsPdf({
  sourcePdfBuffer,
  fields,
  fieldValues,
  envelope,
  signatureMode,
  signatureImageDataUrl = null,
}) {
  const pdfDoc = await PDFDocument.load(sourcePdfBuffer);
  const pages = pdfDoc.getPages();
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const signatureStyle = pickTypedSignatureStyle(envelope.envelope_id);
  const signatureFont = await pdfDoc.embedFont(signatureStyle.font);

  for (const field of fields) {
    const pageNumber = Number(field.page_number);
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pages.length) {
      continue;
    }
    const page = pages[pageNumber - 1];
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const boxX = clamp01(field.x) * pageWidth;
    const boxYTop = clamp01(field.y) * pageHeight;
    const boxWidth = Math.max(1, clamp01(field.width) * pageWidth);
    const boxHeight = Math.max(1, clamp01(field.height) * pageHeight);
    const boxY = pageHeight - boxYTop - boxHeight;

    if (field.field_type === "label") {
      const labelText = normalizeString(field.label);
      if (!labelText) continue;
      const fontSize = Math.max(8, Math.min(18, boxHeight * 0.72));
      page.drawText(labelText, {
        x: boxX + 2,
        y: boxY + Math.max(1, (boxHeight - fontSize) / 2),
        size: fontSize,
        font: italicFont,
        color: rgb(0.2, 0.2, 0.2),
      });
      continue;
    }

    if (field.field_type === "signature") {
      const fieldConfig =
        field?.config_json && typeof field.config_json === "object"
          ? field.config_json
          : {};
      const lockedSignatureImage = fieldConfig.locked
        ? normalizeString(fieldConfig.default_signature_image_data_url)
        : "";
      const parsedLockedImage = parseDataUrl(lockedSignatureImage);
      if (
        parsedLockedImage &&
        ["image/png", "image/jpeg", "image/jpg"].includes(parsedLockedImage.mimeType)
      ) {
        const lockedImage =
          parsedLockedImage.mimeType === "image/png"
            ? await pdfDoc.embedPng(parsedLockedImage.data)
            : await pdfDoc.embedJpg(parsedLockedImage.data);
        const fitted = fitImageIntoBox(
          lockedImage.width,
          lockedImage.height,
          boxX,
          boxY,
          boxWidth,
          boxHeight,
        );
        page.drawImage(lockedImage, fitted);
        continue;
      }

      const lockedSignatureDefault = fieldConfig.locked
        ? normalizeString(fieldConfig.default_value)
        : "";
      if (lockedSignatureDefault) {
        const signatureSize = Math.max(12, boxHeight * signatureStyle.sizeFactor);
        page.drawText(lockedSignatureDefault, {
          x: boxX + 2,
          y: boxY + Math.max(1, (boxHeight - signatureSize) / 2),
          size: signatureSize,
          font: signatureFont,
          rotate: degrees(signatureStyle.angle),
          color: signatureStyle.color,
        });
        continue;
      }

      const parsed = parseDataUrl(signatureImageDataUrl);
      if (parsed && ["image/png", "image/jpeg", "image/jpg"].includes(parsed.mimeType)) {
        const image =
          parsed.mimeType === "image/png"
            ? await pdfDoc.embedPng(parsed.data)
            : await pdfDoc.embedJpg(parsed.data);
        const fitted = fitImageIntoBox(image.width, image.height, boxX, boxY, boxWidth, boxHeight);
        page.drawImage(image, fitted);
        continue;
      }

      // Fallback for legacy payloads that do not include signature_image_data_url.
      const signatureDefault = normalizeString(getFieldDefaultValue(field));
      const signatureText = resolveSignatureValue(
        envelope,
        fieldValues,
        signatureDefault || "Signed",
      );
      const signatureSize = Math.max(12, boxHeight * signatureStyle.sizeFactor);
      page.drawText(signatureText, {
        x: boxX + 2,
        y: boxY + Math.max(1, (boxHeight - signatureSize) / 2),
        size: signatureSize,
        font: signatureFont,
        rotate: degrees(signatureStyle.angle),
        color: signatureStyle.color,
      });
      continue;
    }

    const text = getTextForField(field, fieldValues);
    if (!text) continue;
    const fontSize = Math.max(8, Math.min(14, boxHeight * 0.68));
    page.drawText(text, {
      x: boxX + 2,
      y: boxY + Math.max(1, (boxHeight - fontSize) / 2),
      size: fontSize,
      font: regularFont,
      color: rgb(0, 0, 0),
    });
  }

  return pdfDoc.save();
}

module.exports = {
  generateSignedTermsPdf,
};
