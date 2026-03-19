const {
  PollyClient,
  SynthesizeSpeechCommand,
} = require("@aws-sdk/client-polly");
const {
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  AWS_REGION,
} = require("../config/configuration");

const pollyClient = new PollyClient({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

const escapeSsml = (text = "") =>
  String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const synthesizeSpeech = async (req, res) => {
  const {
    text,
    language = "de-DE",
    speed = "normal",
    structured = false,
    title = "",
    newsText = "",
  } = req.body;

  const hasStructuredPayload =
    Boolean(structured) &&
    (String(title || "").trim().length > 0 ||
      String(newsText || "").trim().length > 0);

  if (!hasStructuredPayload && (!text || text.trim().length === 0)) {
    return res.status(400).json({ error: "Text is required" });
  }

  try {
    let voiceId = "Vicki"; // Default German Female (Neural)

    if (language === "de-DE") {
      voiceId = "Vicki";
    } else if (language === "en-US" || language === "en-EN") {
      voiceId = "Joanna";
    }

    const useSlowRate = String(speed).toLowerCase() === "slow";
    const isGerman = language === "de-DE";

    let requestPayload;

    if (hasStructuredPayload) {
      const labelTitle = isGerman ? "Titel" : "Title";
      const labelNews = isGerman ? "Nachricht" : "News";
      const safeTitle = escapeSsml(title || "");
      const safeNews = escapeSsml(newsText || text || "");

      const ssmlText = useSlowRate
        ? `<speak><prosody rate="80%">${labelTitle}. <break time="240ms"/> ${safeTitle}. <break time="560ms"/> ${labelNews}. <break time="220ms"/> ${safeNews}</prosody></speak>`
        : `<speak>${labelTitle}. <break time="240ms"/> ${safeTitle}. <break time="560ms"/> ${labelNews}. <break time="220ms"/> ${safeNews}</speak>`;

      requestPayload = {
        Text: ssmlText,
        TextType: "ssml",
        OutputFormat: "mp3",
        VoiceId: voiceId,
        Engine: "neural",
      };
    } else {
      requestPayload = useSlowRate
        ? {
            Text: `<speak><prosody rate="80%">${escapeSsml(text)}</prosody></speak>`,
            TextType: "ssml",
            OutputFormat: "mp3",
            VoiceId: voiceId,
            Engine: "neural",
          }
        : {
            Text: text,
            OutputFormat: "mp3",
            VoiceId: voiceId,
            Engine: "neural",
          };
    }

    const command = new SynthesizeSpeechCommand(requestPayload);

    const response = await pollyClient.send(command);

    if (response.AudioStream) {
      // Create a buffer from the stream
      const chunks = [];
      for await (const chunk of response.AudioStream) {
        chunks.push(chunk);
      }
      const audioBuffer = Buffer.concat(chunks);

      res.set({
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.length,
      });
      res.send(audioBuffer);
    } else {
      res.status(500).json({ error: "Failed to generate audio stream" });
    }
  } catch (error) {
    console.log("Error in TTS:", error);
    return res.status(500).json({
      error: "Failed to synthesize speech",
      details: error.message,
    });
  }
};

module.exports = { synthesizeSpeech };
