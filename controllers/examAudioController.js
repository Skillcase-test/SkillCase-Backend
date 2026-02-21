const axios = require("axios");

function extractDriveFileId(url) {
  if (!url) return null;
  try {
    const parsed = new URL(String(url).trim());
    const host = parsed.hostname.toLowerCase();
    if (
      !host.includes("drive.google.com") &&
      !host.includes("drive.usercontent.google.com")
    ) {
      return null;
    }

    const byQuery = parsed.searchParams.get("id");
    if (byQuery) return byQuery;

    const byPath = parsed.pathname.match(/\/file\/d\/([^/]+)/i);
    if (byPath?.[1]) return byPath[1];

    return null;
  } catch {
    return null;
  }
}

function isAudioContentType(contentType) {
  const value = String(contentType || "").toLowerCase();
  return value.startsWith("audio/") || value.includes("application/octet-stream");
}

function extractConfirmToken(html) {
  if (!html) return null;
  const text = String(html);

  const tokenByQuery = text.match(/[?&]confirm=([0-9A-Za-z_-]+)/);
  if (tokenByQuery?.[1]) return tokenByQuery[1];

  const tokenByInput = text.match(/name=["']confirm["'][^>]*value=["']([^"']+)["']/i);
  if (tokenByInput?.[1]) return tokenByInput[1];

  return null;
}

function baseRequestHeaders(rangeHeader, cookieHeader) {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    Accept: "audio/*,*/*;q=0.8",
    Referer: "https://drive.google.com/",
  };
  if (rangeHeader) headers.Range = rangeHeader;
  if (cookieHeader) headers.Cookie = cookieHeader;
  return headers;
}

async function requestStream(url, rangeHeader, cookieHeader) {
  return axios.get(url, {
    responseType: "stream",
    maxRedirects: 5,
    validateStatus: () => true,
    headers: baseRequestHeaders(rangeHeader, cookieHeader),
  });
}

async function requestHtml(url, cookieHeader) {
  return axios.get(url, {
    responseType: "text",
    maxRedirects: 5,
    validateStatus: () => true,
    headers: baseRequestHeaders(undefined, cookieHeader),
  });
}

function forwardAudioResponse(sourceResponse, res) {
  const statusCode = sourceResponse.status === 206 ? 206 : 200;
  const contentType = sourceResponse.headers["content-type"] || "audio/mpeg";

  res.status(statusCode);
  res.setHeader("Content-Type", contentType);
  if (sourceResponse.headers["content-length"]) {
    res.setHeader("Content-Length", sourceResponse.headers["content-length"]);
  }
  if (sourceResponse.headers["accept-ranges"]) {
    res.setHeader("Accept-Ranges", sourceResponse.headers["accept-ranges"]);
  }
  if (sourceResponse.headers["content-range"]) {
    res.setHeader("Content-Range", sourceResponse.headers["content-range"]);
  }
  res.setHeader("Cache-Control", "no-store");

  sourceResponse.data.on("error", () => {
    if (!res.headersSent) {
      res.status(502).json({ msg: "Audio stream error" });
    } else {
      res.end();
    }
  });

  sourceResponse.data.pipe(res);
}

async function proxyDriveAudio(req, res) {
  const rawSource = String(req.query.src || "").trim();
  if (!rawSource) {
    return res.status(400).json({ msg: "src query param is required" });
  }

  const fileId = extractDriveFileId(rawSource);
  if (!fileId) {
    return res.status(400).json({ msg: "Only Google Drive audio links are supported" });
  }

  const rangeHeader = req.headers.range;
  const candidates = [
    `https://drive.google.com/uc?export=download&id=${fileId}`,
    `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`,
    `https://drive.google.com/uc?export=open&id=${fileId}`,
  ];

  for (const candidate of candidates) {
    try {
      const response = await requestStream(candidate, rangeHeader);
      const contentType = response.headers["content-type"];

      if ((response.status === 200 || response.status === 206) && isAudioContentType(contentType)) {
        return forwardAudioResponse(response, res);
      }

      if ((response.status === 200 || response.status === 403) && String(contentType || "").includes("text/html")) {
        const htmlResponse = await requestHtml(candidate);
        const token = extractConfirmToken(htmlResponse.data);
        const cookies = htmlResponse.headers["set-cookie"];
        const cookieHeader = Array.isArray(cookies)
          ? cookies.map((value) => String(value).split(";")[0]).join("; ")
          : undefined;

        if (token) {
          const confirmUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=${token}`;
          const confirmed = await requestStream(confirmUrl, rangeHeader, cookieHeader);
          const confirmedType = confirmed.headers["content-type"];
          if ((confirmed.status === 200 || confirmed.status === 206) && isAudioContentType(confirmedType)) {
            return forwardAudioResponse(confirmed, res);
          }
        }
      }
    } catch {
      // Try next candidate
    }
  }

  return res.status(502).json({ msg: "Unable to stream Google Drive audio" });
}

module.exports = {
  proxyDriveAudio,
};
