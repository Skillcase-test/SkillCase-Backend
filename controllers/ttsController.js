const sdk = require("microsoft-cognitiveservices-speech-sdk");
const { SUBSCRIPTION_KEY, REGION } = require("../config/configuration");

const synthesizeSpeech = async (req, res) => {
  const { text, language = "de-DE" } = req.body;
  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: "Text is required" });
  }
  try {
    const speechConfig = sdk.SpeechConfig.fromSubscription(
      SUBSCRIPTION_KEY,
      REGION
    );
    // Set voice based on language
    if (language === "de-DE") {
      speechConfig.speechSynthesisVoiceName = "de-DE-KatjaNeural"; // Female German voice
    } else if (language === "en-US" || language === "en-EN") {
      speechConfig.speechSynthesisVoiceName = "en-US-JennyNeural"; // Female English voice
    }
    // Output to memory stream (audio buffer)
    speechConfig.speechSynthesisOutputFormat =
      sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;
    const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);
    synthesizer.speakTextAsync(
      text,
      (result) => {
        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
          const audioBuffer = Buffer.from(result.audioData);

          res.set({
            "Content-Type": "audio/mpeg",
            "Content-Length": audioBuffer.length,
          });
          res.send(audioBuffer);
        } else {
          res.status(500).json({
            error: "Speech synthesis failed",
            reason: result.errorDetails,
          });
        }
        synthesizer.close();
      },
      (error) => {
        console.log("Error in synthesizeSpeech controller: ", error);
        res.status(500).json({
          success: false,
          message: "Error in synthesizeSpeech controller",
        });
        synthesizer.close();
      }
    );
  } catch (error) {
    console.log("Error in TTS:", error);
    return res.status(500).json({
      error: "Failed to synthesize speech",
      details: error.message,
    });
  }
};
module.exports = { synthesizeSpeech };
