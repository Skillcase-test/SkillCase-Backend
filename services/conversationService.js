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

  const sentences = [];
  const timestamps = [];
  let lastEndTime = 0;
  let timestampOrder = 1;
  data.sentences.forEach((item) => {
    if (item.type === "timestamp") {
      // Timestamp marker uses previous sentence's end_time
      timestamps.push({
        label: item.label || `${timestampOrder}`,
        timeSeconds: lastEndTime,
        displayOrder: timestampOrder,
      });
      timestampOrder++;
    } else {
      const { speaker, text } = extractSpeaker(item.text);
      sentences.push({
        order: item.order,
        text,
        speaker,
        startTime: item.start_time,
        endTime: item.end_time,
      });
      lastEndTime = item.end_time;
    }
  });
  return {
    title: data.title,
    topic: data.topic || null,
    proficiencyLevel: data.proficiency_level,
    audioDuration: data.audio_duration,
    sentences,
    timestamps,
  };
};

module.exports = {
  extractSpeaker,
  parseConversationJson,
};
