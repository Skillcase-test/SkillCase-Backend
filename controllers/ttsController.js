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

const synthesizeSpeech = async (req, res) => {
  const { text, language = "de-DE" } = req.body;
  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: "Text is required" });
  }

  try {
    let voiceId = "Vicki"; // Default German Female (Neural)

    if (language === "de-DE") {
      voiceId = "Vicki";
    } else if (language === "en-US" || language === "en-EN") {
      voiceId = "Joanna";
    }

    const command = new SynthesizeSpeechCommand({
      Text: text,
      OutputFormat: "mp3",
      VoiceId: voiceId,
      Engine: "neural",
    });

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
