const extractSpeaker = (text) => {
  const colonIdx = text.indexOf(":");
  if (colonIdx > 0 && colonIdx < 50) {
    const speaker = text.substring(0, colonIdx).trim();
    const sentenceText = text.substring(colonIdx + 1).trim();
    return { speaker, text: sentenceText };
  }
  return { speaker: null, text };
};

const parseConversationJson = (jsonData) => {
  const data = typeof jsonData === "string" ? JSON.parse(jsonData) : jsonData;
  const sentences = data.sentences.map((s) => {
    const { speaker, text } = extractSpeaker(s.text);
    return {
      order: s.order,
      text,
      speaker,
      startTime: s.start_time,
      endTime: s.end_time,
    };
  });

  return {
    title: data.title,
    topic: data.topic || null,
    proficiencyLevel: data.proficiency_level,
    audioDuration: data.audio_duration,
    sentences,
  };
};

module.exports = {
  extractSpeaker,
  parseConversationJson,
};
