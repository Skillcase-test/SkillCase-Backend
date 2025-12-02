const pdf = require("pdf-parse");

const normalizeText = (text) => {
  let normalized = text;

  normalized = normalized.replace(/([.,;:])([A-Za-z])/g, "$1 $2");

  // Fix missing spaces before opening parentheses/brackets
  normalized = normalized.replace(/([a-z])(\(|\[)/gi, "$1 $2");

  // Add space before currency symbols if missing
  normalized = normalized.replace(/([a-z])(\$|€|£|¥)/gi, "$1 $2");

  // Add space after currency symbols if missing (before numbers)
  normalized = normalized.replace(/(\$|€|£|¥)(\d)/g, "$1 $2");

  // Add space before numbers that follow letters without space
  normalized = normalized.replace(/([a-z])(\d)/gi, "$1 $2");

  // Add space after numbers that precede letters without space (except common units)
  normalized = normalized.replace(/(\d)([a-zA-Z])/g, (match, num, letter) => {
    // Don't add space for common units like 100K, 5MB, 3GB, etc.
    if (/^[KMGTB]$/i.test(letter)) {
      return match;
    }
    return `${num} ${letter}`;
  });

  // Fix concatenated words (lowercase followed by uppercase - likely camelCase or missing space)
  normalized = normalized.replace(/([a-z])([A-Z])/g, "$1 $2");

  // Fix common word concatenations (lowercase word + lowercase word without space)
  normalized = normalized.replace(
    /([a-z]{3,})(and|with|using|for|the|from|into|that|this|which)([^a-z])/gi,
    "$1 $2$3"
  );

  // Fix article concatenations: "theAI", "auser" -> "the AI", "a user"
  normalized = normalized.replace(/\b(the|a|an)([A-Z][a-z]+)/g, "$1 $2");

  // Fix multiple spaces
  normalized = normalized.replace(/\s{2,}/g, " ");

  // Fix spacing around common punctuation (remove extra spaces before punctuation)
  normalized = normalized.replace(/\s+([.,;:!?])/g, "$1");

  return normalized.trim();
};

const extractTextFromPdf = async (pdfBuffer) => {
  try {
    const result = await pdf(pdfBuffer);
    let text = result.text.trim();

    if (!text || text.length < 50) {
      throw new Error(
        "PDF appears to be empty or contains insufficient information"
      );
    }

    // Normalize text to fix spacing issues
    text = normalizeText(text);

    return text;
  } catch (error) {
    console.log("Error in parsing PDF:", error.message);
    throw new Error(`Failed to parse PDF: ${error.message}`);
  }
};

module.exports = { extractTextFromPdf };
