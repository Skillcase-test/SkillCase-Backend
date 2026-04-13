const { pool } = require("../../util/db");

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

async function getTopics(req, res) {
  const userId = req.user?.user_id;

  try {
    const result = await pool.query(
      `
      SELECT
        c.id as chapter_id, c.chapter_name, c.description, c.order_index,
        t.id as topic_id, t.name, t.prerequisites,
        p.current_level, p.current_set, p.is_fully_completed, p.levels_completed
      FROM a1_chapter c
      LEFT JOIN a1_test_topic t ON t.chapter_id = c.id
      LEFT JOIN a1_test_progress p ON p.topic_id = t.id AND p.user_id = $1
      WHERE c.module = 'test' AND c.is_active = true
      ORDER BY c.order_index ASC
      `,
      [userId],
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching A1 test topics:", err);
    res.status(500).json({ error: "Failed to fetch topics" });
  }
}

async function getTopicProgress(req, res) {
  const { topicId } = req.params;
  const userId = req.user?.user_id;

  try {
    const progressResult = await pool.query(
      `
      SELECT current_level, current_set, attempts_on_current_set, levels_completed,
             is_fully_completed, completed_sets
      FROM a1_test_progress
      WHERE topic_id = $1 AND user_id = $2
      `,
      [topicId, userId],
    );

    const topicResult = await pool.query(
      `SELECT name, prerequisites FROM a1_test_topic WHERE id = $1`,
      [topicId],
    );

    res.json({
      topic: topicResult.rows[0],
      progress: progressResult.rows[0] || {
        current_level: 1,
        current_set: 1,
        attempts_on_current_set: 0,
        levels_completed: 0,
        is_fully_completed: false,
        completed_sets: [],
      },
    });
  } catch (err) {
    console.error("Error fetching A1 test progress:", err);
    res.status(500).json({ error: "Failed to fetch progress" });
  }
}

async function getTestSet(req, res) {
  const { topicId, level, setNumber } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT questions FROM a1_test_set
      WHERE topic_id = $1 AND level = $2 AND set_number = $3
      `,
      [topicId, level, setNumber],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Test set not found" });
    }

    const questions = shuffleArray(result.rows[0].questions);

    const shuffledQuestions = questions.map((q) => {
      if (q.options && Array.isArray(q.options)) {
        const shuffledOptions = shuffleArray(q.options);
        if (typeof q.correct === "number") {
          const correctOption = q.options[q.correct];
          return {
            ...q,
            options: shuffledOptions,
            correct: shuffledOptions.indexOf(correctOption),
          };
        }
      }
      return q;
    });

    res.json({ questions: shuffledQuestions });
  } catch (err) {
    console.error("Error fetching A1 test set:", err);
    res.status(500).json({ error: "Failed to fetch test set" });
  }
}

async function submitTest(req, res) {
  const userId = req.user?.user_id;
  const { topicId, level, setNumber, answers } = req.body;

  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    let questions = req.body.questions;

    if (!questions || !Array.isArray(questions)) {
      const setResult = await pool.query(
        `
        SELECT questions FROM a1_test_set
        WHERE topic_id = $1 AND level = $2 AND set_number = $3
        `,
        [topicId, level, setNumber],
      );

      if (setResult.rows.length === 0) {
        return res.status(404).json({ error: "Test set not found" });
      }

      questions = setResult.rows[0].questions;
    }

    let correct = 0;

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const userAnswer = answers[i];
      let isCorrect = false;

      switch (q.type) {
        case "matching":
          if (Array.isArray(userAnswer) && Array.isArray(q.pairs)) {
            const userPairStr = userAnswer
              .map((p) => `${p.de}-${p.en}`)
              .sort()
              .join("|");
            const correctPairStr = q.pairs
              .map((p) => `${p.de}-${p.en}`)
              .sort()
              .join("|");
            isCorrect = userPairStr === correctPairStr;
          }
          break;

        case "fill_options":
        case "mcq_single":
          isCorrect = userAnswer === q.correct;
          break;

        case "fill_typing": {
          const correctTyping = String(q.correct || "")
            .toLowerCase()
            .trim();
          const userTyping = String(userAnswer || "")
            .toLowerCase()
            .trim();
          isCorrect = userTyping === correctTyping;
          break;
        }

        case "sentence_correction": {
          const normalize = (s) =>
            String(s || "")
              .toLowerCase()
              .trim()
              .replace(/[.,!?;:]+$/g, "");
          isCorrect = normalize(userAnswer) === normalize(q.correct_sentence);
          break;
        }

        case "mcq_multi":
          if (Array.isArray(userAnswer) && Array.isArray(q.correct)) {
            const userSorted = [...userAnswer].sort().join(",");
            const correctSorted = [...q.correct].sort().join(",");
            isCorrect = userSorted === correctSorted;
          }
          break;

        case "true_false":
          isCorrect = userAnswer === q.correct;
          break;

        case "sentence_ordering":
          if (Array.isArray(userAnswer) && Array.isArray(q.correct_order)) {
            isCorrect =
              userAnswer.join(" ") === (q.correct_order || []).join(" ");
          }
          break;

        default: {
          const defaultCorrect = String(q.correct || "")
            .toLowerCase()
            .trim();
          const defaultUser = String(userAnswer || "")
            .toLowerCase()
            .trim();
          isCorrect = defaultUser === defaultCorrect;
        }
      }

      if (isCorrect) correct++;
    }

    const score = (correct / questions.length) * 100;
    const passed = score >= 60;

    const progressResult = await pool.query(
      `
      SELECT id, current_level, current_set, attempts_on_current_set, completed_sets, levels_completed
      FROM a1_test_progress
      WHERE topic_id = $1 AND user_id = $2
      `,
      [topicId, userId],
    );

    const progress = progressResult.rows[0];
    let completedSets = progress?.completed_sets || [];
    let attemptsOnCurrentSet = (progress?.attempts_on_current_set || 0) + 1;
    let currentLevel = progress?.current_level || 1;
    let currentSet = progress?.current_set || 1;
    let levelsCompleted = progress?.levels_completed || 0;

    if (passed) {
      completedSets.push({
        level: parseInt(level, 10),
        set: parseInt(setNumber, 10),
        score,
        passed: true,
      });

      if (parseInt(level, 10) < 5) {
        currentLevel = parseInt(level, 10) + 1;
        currentSet = 1;
        levelsCompleted = parseInt(level, 10);
        attemptsOnCurrentSet = 0;
      } else {
        levelsCompleted = 5;
      }
    } else if (attemptsOnCurrentSet >= 3) {
      // Keep exact A2 behavior: after attempt limit, restart set flow for same level.
      currentSet = 1;
      attemptsOnCurrentSet = 0;
    } else {
      currentSet = Math.min(3, currentSet + 1);
    }

    const isFullyCompleted = levelsCompleted >= 5;

    let topicInfo = null;
    if (isFullyCompleted) {
      const topicResult = await pool.query(
        `SELECT name, prerequisites FROM a1_test_topic WHERE id = $1`,
        [topicId],
      );
      topicInfo = topicResult.rows[0] || null;
    }

    await pool.query(
      `
      INSERT INTO a1_test_progress (user_id, topic_id, current_level, current_set, attempts_on_current_set,
                                    levels_completed, is_fully_completed, completed_sets, last_attempted)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (user_id, topic_id)
      DO UPDATE SET
        current_level = EXCLUDED.current_level,
        current_set = EXCLUDED.current_set,
        attempts_on_current_set = EXCLUDED.attempts_on_current_set,
        levels_completed = EXCLUDED.levels_completed,
        is_fully_completed = EXCLUDED.is_fully_completed,
        completed_sets = EXCLUDED.completed_sets,
        last_attempted = NOW()
      `,
      [
        userId,
        topicId,
        currentLevel,
        currentSet,
        attemptsOnCurrentSet,
        levelsCompleted,
        isFullyCompleted,
        JSON.stringify(completedSets),
      ],
    );

    res.json({
      score,
      passed,
      correct,
      total: questions.length,
      currentLevel,
      currentSet,
      attemptsRemaining: passed ? 3 : Math.max(0, 3 - attemptsOnCurrentSet),
      isFullyCompleted,
      ...(topicInfo && {
        topicName: topicInfo.name,
        prerequisites: topicInfo.prerequisites,
      }),
    });
  } catch (err) {
    console.error("Error submitting A1 test:", err);
    res.status(500).json({ error: "Failed to submit test" });
  }
}

async function getReviewData(req, res) {
  const { topicId } = req.params;
  const userId = req.user?.user_id;

  try {
    const progressResult = await pool.query(
      `
      SELECT completed_sets, is_fully_completed
      FROM a1_test_progress
      WHERE topic_id = $1 AND user_id = $2
      `,
      [topicId, userId],
    );

    if (
      progressResult.rows.length === 0 ||
      !progressResult.rows[0].is_fully_completed
    ) {
      return res
        .status(403)
        .json({ error: "Must complete all levels to review" });
    }

    const setsResult = await pool.query(
      `
      SELECT level, set_number, questions
      FROM a1_test_set
      WHERE topic_id = $1
      ORDER BY level, set_number
      `,
      [topicId],
    );

    res.json({
      completedSets: progressResult.rows[0].completed_sets,
      allSets: setsResult.rows,
    });
  } catch (err) {
    console.error("Error fetching A1 review data:", err);
    res.status(500).json({ error: "Failed to fetch review data" });
  }
}

async function getTestResults(req, res) {
  const { topicId, level } = req.params;
  const userId = req.user?.user_id;

  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const progressResult = await pool.query(
      `
      SELECT completed_sets, levels_completed
      FROM a1_test_progress
      WHERE user_id = $1 AND topic_id = $2
      `,
      [userId, topicId],
    );

    if (progressResult.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "No progress found for this topic" });
    }

    const completedSets = progressResult.rows[0].completed_sets || [];

    const levelResult = completedSets.find(
      (s) => s.level === parseInt(level, 10) && s.passed === true,
    );

    if (!levelResult) {
      return res.status(404).json({ error: "Level not completed yet" });
    }

    const setResult = await pool.query(
      `
      SELECT set_number, questions
      FROM a1_test_set
      WHERE topic_id = $1 AND level = $2
      ORDER BY set_number ASC
      `,
      [topicId, level],
    );

    const allQuestions = setResult.rows.flatMap((row) => row.questions || []);
    const questionsBySet = setResult.rows.map((row) => ({
      setNumber: row.set_number,
      questions: row.questions || [],
    }));

    res.json({
      passed: true,
      score: levelResult.score || 0,
      level: parseInt(level, 10),
      questions: allQuestions,
      questionsBySet,
    });
  } catch (err) {
    console.error("Error fetching A1 test results:", err);
    res.status(500).json({ error: "Failed to fetch results" });
  }
}

module.exports = {
  getTopics,
  getTopicProgress,
  getTestSet,
  submitTest,
  getReviewData,
  getTestResults,
};
