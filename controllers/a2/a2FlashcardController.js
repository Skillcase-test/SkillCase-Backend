const { pool } = require("../../util/db.js");

// Get all flashcard chapters with progress
async function getChapters(req, res) {
  const userId = req.user?.user_id;

  try {
    const result = await pool.query(
      `
      SELECT 
        c.id, c.chapter_name, c.description, c.order_index,
        s.set_id, s.number_of_cards,
        p.current_index, p.is_completed, p.mini_quiz_passed, p.final_quiz_passed
      FROM a2_chapter c
      LEFT JOIN a2_flashcard_set s ON s.chapter_id = c.id
      LEFT JOIN a2_flashcard_progress p ON p.set_id = s.set_id AND p.user_id = $1
      WHERE c.module = 'flashcard' AND c.is_active = true
      ORDER BY c.order_index ASC
    `,
      [userId],
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching A2 flashcard chapters:", err);
    res.status(500).json({ error: "Failed to fetch chapters" });
  }
}

// Get cards for a chapter
async function getCards(req, res) {
  const { chapterId } = req.params;
  const userId = req.user?.user_id;

  try {
    // Get set for chapter
    const setResult = await pool.query(
      `SELECT set_id FROM a2_flashcard_set WHERE chapter_id = $1`,
      [chapterId],
    );

    if (setResult.rows.length === 0) {
      return res.status(404).json({ error: "Chapter not found" });
    }

    const setId = setResult.rows[0].set_id;

    // Get cards
    const cardsResult = await pool.query(
      `
      SELECT card_id, front_de, front_meaning, back_de, back_en, card_index
      FROM a2_flashcard
      WHERE set_id = $1
      ORDER BY card_index ASC
    `,
      [setId],
    );

    // Get user progress
    const progressResult = await pool.query(
      `
      SELECT current_index, mini_quiz_passed, final_quiz_passed
      FROM a2_flashcard_progress
      WHERE set_id = $1 AND user_id = $2
    `,
      [setId, userId],
    );

    res.json({
      setId,
      cards: cardsResult.rows,
      progress: progressResult.rows[0] || {
        current_index: 0,
        mini_quiz_passed: false,
        final_quiz_passed: false,
      },
    });
  } catch (err) {
    console.error("Error fetching A2 flashcards:", err);
    res.status(500).json({ error: "Failed to fetch cards" });
  }
}

// Save progress
async function saveProgress(req, res) {
  const userId = req.user?.user_id;
  const { setId, currentIndex, isCompleted } = req.body;

  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    await pool.query(
      `
      INSERT INTO a2_flashcard_progress (user_id, set_id, current_index, is_completed, last_reviewed)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (user_id, set_id)
      DO UPDATE SET current_index = $3, is_completed = $4, last_reviewed = NOW()
    `,
      [userId, setId, currentIndex, isCompleted || false],
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Error saving A2 flashcard progress:", err);
    res.status(500).json({ error: "Failed to save progress" });
  }
}

// Generate mini quiz (5 questions, 60-40 word/sentence)
async function generateMiniQuiz(req, res) {
  const { setId } = req.params;

  try {
    const cardsResult = await pool.query(
      `
      SELECT card_id, front_de, front_meaning, back_de, back_en
      FROM a2_flashcard
      WHERE set_id = $1
      ORDER BY RANDOM()
      LIMIT 8
    `,
      [setId],
    );

    const cards = cardsResult.rows;
    const questions = [];

    // Generate 3 word-level questions (60%)
    for (let i = 0; i < 3 && i < cards.length; i++) {
      const card = cards[i];
      const wrongOptions = cards
        .filter((c) => c.card_id !== card.card_id)
        .slice(0, 3)
        .map((c) => c.front_meaning);

      questions.push({
        id: `word_${card.card_id}`,
        type: "mcq_single",
        category: "word",
        question: `What does "${card.front_de}" mean?`,
        options: shuffleArray([card.front_meaning, ...wrongOptions]),
        correct: card.front_meaning,
      });
    }

    // Generate 2 sentence-level questions (40%)
    for (let i = 3; i < 5 && i < cards.length; i++) {
      const card = cards[i];
      const wrongOptions = cards
        .filter((c) => c.card_id !== card.card_id)
        .slice(0, 3)
        .map((c) => c.back_en);

      questions.push({
        id: `sentence_${card.card_id}`,
        type: "mcq_single",
        category: "sentence",
        question: `What does "${card.back_de}" mean?`,
        options: shuffleArray([card.back_en, ...wrongOptions]),
        correct: card.back_en,
      });
    }

    res.json({ questions: shuffleArray(questions) });
  } catch (err) {
    console.error("Error generating mini quiz:", err);
    res.status(500).json({ error: "Failed to generate quiz" });
  }
}

// Generate final quiz (30 questions, 60-40 word/sentence)
async function generateFinalQuiz(req, res) {
  const { setId } = req.params;

  try {
    const cardsResult = await pool.query(
      `
      SELECT card_id, front_de, front_meaning, back_de, back_en
      FROM a2_flashcard
      WHERE set_id = $1
      ORDER BY RANDOM()
    `,
      [setId],
    );

    const cards = cardsResult.rows;
    const questions = [];
    const wordCount = Math.floor(30 * 0.6); // 18 word-level
    const sentenceCount = 30 - wordCount; // 12 sentence-level

    // Word-level questions
    for (let i = 0; i < wordCount && i < cards.length; i++) {
      const card = cards[i];
      const wrongOptions = cards
        .filter((c) => c.card_id !== card.card_id)
        .slice(0, 3)
        .map((c) => c.front_meaning);

      questions.push({
        id: `word_${card.card_id}`,
        type: "mcq_single",
        category: "word",
        question: `What does "${card.front_de}" mean?`,
        options: shuffleArray([card.front_meaning, ...wrongOptions]),
        correct: card.front_meaning,
      });
    }

    // Sentence-level questions
    for (let i = 0; i < sentenceCount && i < cards.length; i++) {
      const card = cards[i];
      const wrongOptions = cards
        .filter((c) => c.card_id !== card.card_id)
        .slice(0, 3)
        .map((c) => c.back_en);

      questions.push({
        id: `sentence_${card.card_id}`,
        type: "mcq_single",
        category: "sentence",
        question: `What does "${card.back_de}" mean?`,
        options: shuffleArray([card.back_en, ...wrongOptions]),
        correct: card.back_en,
      });
    }

    res.json({ questions: shuffleArray(questions) });
  } catch (err) {
    console.error("Error generating final quiz:", err);
    res.status(500).json({ error: "Failed to generate quiz" });
  }
}

// Submit quiz
async function submitQuiz(req, res) {
  const userId = req.user?.user_id;
  const { setId, answers, quizType } = req.body;

  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    // Calculate score
    let correct = 0;
    const total = answers.length;

    for (const answer of answers) {
      if (answer.userAnswer === answer.correctAnswer) {
        correct++;
      }
    }

    const score = (correct / total) * 100;
    const passed = score >= 60;

    // Save quiz result
    await pool.query(
      `
      INSERT INTO a2_flashcard_quiz_result (user_id, set_id, quiz_type, score, passed, answers)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
      [userId, setId, quizType, score, passed, JSON.stringify(answers)],
    );

    // Update progress if passed
    if (passed) {
      const column =
        quizType === "mini" ? "mini_quiz_passed" : "final_quiz_passed";
      await pool.query(
        `
        UPDATE a2_flashcard_progress
        SET ${column} = true
        WHERE user_id = $1 AND set_id = $2
      `,
        [userId, setId],
      );
    }

    res.json({ score, passed, correct, total });
  } catch (err) {
    console.error("Error submitting quiz:", err);
    res.status(500).json({ error: "Failed to submit quiz" });
  }
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
