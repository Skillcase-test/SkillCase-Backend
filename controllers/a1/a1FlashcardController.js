const { pool } = require("../../util/db");

// Get all A1 flashcard chapters with user progress.
async function getChapters(req, res) {
  const userId = req.user?.user_id;

  try {
    const result = await pool.query(
      `
      SELECT
        c.id, c.chapter_name, c.description, c.order_index,
        (c.order_index + 1) AS module_number,
        s.set_id, s.number_of_cards,
        p.current_index, p.is_completed, p.mini_quiz_passed, p.final_quiz_passed
      FROM a1_chapter c
      LEFT JOIN a1_flashcard_set s ON s.chapter_id = c.id
      LEFT JOIN a1_flashcard_progress p ON p.set_id = s.set_id AND p.user_id = $1
      WHERE c.module = 'flashcard' AND c.is_active = true
      ORDER BY c.order_index ASC
      `,
      [userId],
    );

    return res.json(result.rows);
  } catch (err) {
    console.error("Error fetching A1 flashcard chapters:", err);
    return res.status(500).json({ error: "Failed to fetch chapters" });
  }
}

// Get cards for one chapter and include user progress snapshot.
async function getCards(req, res) {
  const { chapterId } = req.params;
  const userId = req.user?.user_id;

  try {
    const setResult = await pool.query(
      `SELECT set_id FROM a1_flashcard_set WHERE chapter_id = $1`,
      [chapterId],
    );

    if (setResult.rows.length === 0) {
      return res.status(404).json({ error: "Chapter not found" });
    }

    const setId = setResult.rows[0].set_id;

    const cardsResult = await pool.query(
      `
      SELECT card_id, word_de, meaning_en, sample_sentence_de, front_image_url, image_name, card_index
      FROM a1_flashcard
      WHERE set_id = $1
      ORDER BY card_index ASC
      `,
      [setId],
    );

    const progressResult = await pool.query(
      `
      SELECT current_index, mini_quiz_passed, final_quiz_passed
      FROM a1_flashcard_progress
      WHERE set_id = $1 AND user_id = $2
      `,
      [setId, userId],
    );

    return res.json({
      setId,
      cards: cardsResult.rows,
      progress: progressResult.rows[0] || {
        current_index: 0,
        mini_quiz_passed: false,
        final_quiz_passed: false,
      },
    });
  } catch (err) {
    console.error("Error fetching A1 flashcards:", err);
    return res.status(500).json({ error: "Failed to fetch cards" });
  }
}

async function saveProgress(req, res) {
  const userId = req.user?.user_id;
  const { setId, currentIndex, isCompleted } = req.body;

  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    await pool.query(
      `
      INSERT INTO a1_flashcard_progress (user_id, set_id, current_index, is_completed, last_reviewed)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (user_id, set_id)
      DO UPDATE SET current_index = $3, is_completed = $4, last_reviewed = NOW()
      `,
      [userId, setId, currentIndex, isCompleted || false],
    );

    return res.json({ success: true });
  } catch (err) {
    console.error("Error saving A1 flashcard progress:", err);
    return res.status(500).json({ error: "Failed to save progress" });
  }
}

function buildSnapshotKey(quizType) {
  return quizType === "mini" ? "mini_quiz_snapshot" : "final_quiz_snapshot";
}

async function ensureProgressRow(userId, setId) {
  await pool.query(
    `
    INSERT INTO a1_flashcard_progress (user_id, set_id, current_index, is_completed, last_reviewed)
    VALUES ($1, $2, 0, false, NOW())
    ON CONFLICT (user_id, set_id) DO NOTHING
    `,
    [userId, setId],
  );
}

function buildDeterministicOptions(correct, allMeanings) {
  const normalizedCorrect = String(correct || "")
    .trim()
    .toLowerCase();
  const uniqueWrong = Array.from(
    new Set(
      (allMeanings || []).filter((m) => {
        const n = String(m || "")
          .trim()
          .toLowerCase();
        return n && n !== normalizedCorrect;
      }),
    ),
  )
    .sort((a, b) => String(a).localeCompare(String(b)))
    .slice(0, 3);

  return [correct, ...uniqueWrong];
}

function buildDeterministicQuizQuestions(
  cards,
  desiredWordCount,
  desiredSentenceCount,
) {
  const questions = [];
  const allMeanings = cards
    .map((c) => c.meaning_en)
    .filter((m) => typeof m === "string" && m.trim().length > 0);

  for (const card of cards) {
    if (
      questions.filter((q) => q.category === "word").length >= desiredWordCount
    ) {
      break;
    }
    const options = buildDeterministicOptions(card.meaning_en, allMeanings);
    if (options.length < 2) continue;

    questions.push({
      id: `word_${card.card_id}`,
      type: "mcq_single",
      category: "word",
      question: `What does "${card.word_de}" mean?`,
      options,
      correct: card.meaning_en,
    });
  }

  for (const card of cards) {
    if (
      questions.filter((q) => q.category === "sentence").length >=
      desiredSentenceCount
    ) {
      break;
    }
    const options = buildDeterministicOptions(card.meaning_en, allMeanings);
    if (options.length < 2) continue;

    questions.push({
      id: `sentence_${card.card_id}`,
      type: "mcq_single",
      category: "sentence",
      question: `What is the meaning of "${card.sample_sentence_de}"?`,
      options,
      correct: card.meaning_en,
    });
  }

  return questions;
}

async function getOrCreateQuizSnapshot({ userId, setId, quizType, cards }) {
  await ensureProgressRow(userId, setId);

  const column = buildSnapshotKey(quizType);
  const passCol =
    quizType === "mini" ? "mini_quiz_passed" : "final_quiz_passed";

  const progressRes = await pool.query(
    `SELECT ${column} AS snapshot, ${passCol} AS passed FROM a1_flashcard_progress WHERE user_id = $1 AND set_id = $2`,
    [userId, setId],
  );

  const progress = progressRes.rows[0] || {};
  if (progress.snapshot && Array.isArray(progress.snapshot.questions)) {
    return {
      questions: progress.snapshot.questions,
      passed: !!progress.passed,
      locked: !!progress.passed,
    };
  }

  const targetTotal =
    quizType === "mini"
      ? Math.min(5, cards.length)
      : Math.min(30, cards.length);
  const wordCount =
    quizType === "mini"
      ? Math.min(3, targetTotal)
      : Math.min(Math.floor(targetTotal * 0.6), targetTotal);
  const sentenceCount = Math.max(0, targetTotal - wordCount);

  const questions = buildDeterministicQuizQuestions(
    cards,
    wordCount,
    sentenceCount,
  );

  await pool.query(
    `UPDATE a1_flashcard_progress SET ${column} = $3::jsonb, last_reviewed = NOW() WHERE user_id = $1 AND set_id = $2`,
    [
      userId,
      setId,
      JSON.stringify({ questions, createdAt: new Date().toISOString() }),
    ],
  );

  return { questions, passed: !!progress.passed, locked: false };
}

async function generateMiniQuiz(req, res) {
  const { setId } = req.params;
  const userId = req.user?.user_id;

  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const cardsResult = await pool.query(
      `
      SELECT card_id, word_de, meaning_en, sample_sentence_de
      FROM a1_flashcard
      WHERE set_id = $1
      ORDER BY card_index ASC
      `,
      [setId],
    );

    const cards = cardsResult.rows;
    if (cards.length < 2) {
      return res
        .status(400)
        .json({ error: "At least 2 cards are required to generate a quiz" });
    }

    const snapshot = await getOrCreateQuizSnapshot({
      userId,
      setId,
      quizType: "mini",
      cards,
    });

    return res.json({
      questions: snapshot.questions,
      locked: snapshot.locked,
      passed: snapshot.passed,
    });
  } catch (err) {
    console.error("Error generating A1 mini quiz:", err);
    return res.status(500).json({ error: "Failed to generate quiz" });
  }
}

async function generateFinalQuiz(req, res) {
  const { setId } = req.params;
  const userId = req.user?.user_id;

  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const cardsResult = await pool.query(
      `
      SELECT card_id, word_de, meaning_en, sample_sentence_de
      FROM a1_flashcard
      WHERE set_id = $1
      ORDER BY card_index ASC
      `,
      [setId],
    );

    const cards = cardsResult.rows;
    if (cards.length < 2) {
      return res
        .status(400)
        .json({ error: "At least 2 cards are required to generate a quiz" });
    }

    const snapshot = await getOrCreateQuizSnapshot({
      userId,
      setId,
      quizType: "final",
      cards,
    });

    return res.json({
      questions: snapshot.questions,
      locked: snapshot.locked,
      passed: snapshot.passed,
    });
  } catch (err) {
    console.error("Error generating A1 final quiz:", err);
    return res.status(500).json({ error: "Failed to generate quiz" });
  }
}

async function submitQuiz(req, res) {
  const userId = req.user?.user_id;
  const { setId, answers, quizType } = req.body;

  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  if (!setId) return res.status(400).json({ error: "setId is required" });
  if (!Array.isArray(answers) || answers.length === 0) {
    return res.status(400).json({ error: "answers must be a non-empty array" });
  }
  if (!["mini", "final"].includes(quizType)) {
    return res.status(400).json({ error: "quizType must be mini or final" });
  }

  try {
    let correct = 0;
    const total = answers.length;

    const passCol =
      quizType === "mini" ? "mini_quiz_passed" : "final_quiz_passed";
    const alreadyPassedRes = await pool.query(
      `SELECT ${passCol} AS passed FROM a1_flashcard_progress WHERE user_id = $1 AND set_id = $2`,
      [userId, setId],
    );

    if (alreadyPassedRes.rows[0]?.passed) {
      const latestResult = await pool.query(
        `
    SELECT score, passed, answers
    FROM a1_flashcard_quiz_result
    WHERE user_id = $1 AND set_id = $2 AND quiz_type = $3
    ORDER BY created_at DESC
    LIMIT 1
    `,
        [userId, setId, quizType],
      );

      const existing = latestResult.rows[0];
      return res.json({
        score: existing?.score ?? 100,
        passed: true,
        correct: Array.isArray(existing?.answers)
          ? existing.answers.filter((a) => a?.isCorrect).length
          : answers.length,
        total: Array.isArray(existing?.answers)
          ? existing.answers.length
          : answers.length,
        locked: true,
        message: "Quiz already passed. Retake is locked.",
      });
    }

    for (const answer of answers) {
      if (answer.userAnswer === answer.correctAnswer) {
        correct++;
      }
    }

    const score = (correct / total) * 100;
    const passed = score >= 60;

    await pool.query(
      `
      INSERT INTO a1_flashcard_quiz_result (user_id, set_id, quiz_type, score, passed, answers)
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [userId, setId, quizType, score, passed, JSON.stringify(answers)],
    );

    if (passed) {
      await pool.query(
        `
        INSERT INTO a1_flashcard_progress (user_id, set_id, current_index, is_completed, last_reviewed)
        VALUES ($1, $2, 0, false, NOW())
        ON CONFLICT (user_id, set_id)
        DO UPDATE SET last_reviewed = NOW()
        `,
        [userId, setId],
      );

      const column =
        quizType === "mini" ? "mini_quiz_passed" : "final_quiz_passed";
      await pool.query(
        `
        UPDATE a1_flashcard_progress
        SET ${column} = true
        WHERE user_id = $1 AND set_id = $2
        `,
        [userId, setId],
      );
    }

    return res.json({ score, passed, correct, total });
  } catch (err) {
    console.error("Error submitting A1 flashcard quiz:", err);
    return res.status(500).json({ error: "Failed to submit quiz" });
  }
}

function buildQuizQuestions(cards, desiredWordCount, desiredSentenceCount) {
  const shuffledCards = shuffleArray(cards);
  const questions = [];
  const usedWordCardIds = new Set();
  const usedSentenceCardIds = new Set();

  const allMeanings = shuffledCards
    .map((c) => c.meaning_en)
    .filter((m) => typeof m === "string" && m.trim().length > 0);

  for (const card of shuffledCards) {
    if (questions.length >= desiredWordCount) break;
    if (usedWordCardIds.has(card.card_id)) continue;

    const options = buildUniqueOptions(card.meaning_en, allMeanings);
    if (options.length < 2) continue;

    questions.push({
      id: `word_${card.card_id}`,
      type: "mcq_single",
      category: "word",
      question: `What does "${card.word_de}" mean?`,
      options,
      correct: card.meaning_en,
    });
    usedWordCardIds.add(card.card_id);
  }

  for (const card of shuffledCards) {
    if (
      questions.filter((q) => q.category === "sentence").length >=
      desiredSentenceCount
    ) {
      break;
    }
    if (usedSentenceCardIds.has(card.card_id)) continue;

    const options = buildUniqueOptions(card.meaning_en, allMeanings);
    if (options.length < 2) continue;

    questions.push({
      id: `sentence_${card.card_id}`,
      type: "mcq_single",
      category: "sentence",
      question: `What is the meaning of "${card.sample_sentence_de}"?`,
      options,
      correct: card.meaning_en,
    });
    usedSentenceCardIds.add(card.card_id);
  }

  return shuffleArray(questions);
}

function buildUniqueOptions(correct, allMeanings) {
  const uniqueWrong = shuffleArray(
    Array.from(
      new Set(
        allMeanings.filter(
          (meaning) =>
            meaning &&
            String(meaning).trim().toLowerCase() !==
              String(correct).trim().toLowerCase(),
        ),
      ),
    ),
  ).slice(0, 3);

  return shuffleArray([correct, ...uniqueWrong]);
}

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

module.exports = {
  getChapters,
  getCards,
  saveProgress,
  generateMiniQuiz,
  generateFinalQuiz,
  submitQuiz,
};
