const { GoogleGenAI } = require("@google/genai");

const geminiConfig = {
  apiKey: process.env.GEMINI_API_KEY,
  model: "gemini-2.0-flash",
  generationConfig: {
    temperature: 0.1,
    maxOutputTokens: 4000,
  },
};

let genAI = null;

const initializeGemini = () => {
  if (!geminiConfig.apiKey) {
    console.log("Gemini api key not found!");
    return null;
  }

  try {
    genAI = new GoogleGenAI({ apiKey: geminiConfig.apiKey });
    console.log("Gemini AI initialized with model:", geminiConfig.model);
    return genAI;
  } catch (error) {
    console.log("Error in initializing gemini: ", error.message);
    return null;
  }
};

const getGeminiClient = () => {
  if (!genAI) {
    return initializeGemini();
  }
  return genAI;
};

module.exports = { geminiConfig, initializeGemini, getGeminiClient };
