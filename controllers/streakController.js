const { pool } = require("../util/db");

function getTodayIST() {
  const now = new Date();
  // IST is UTC+5:30
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  return istTime.toISOString().split("T")[0];
}

function getYesterdayIST() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  istTime.setDate(istTime.getDate() - 1);
  return istTime.toISOString().split("T")[0];
}

// Get user's streak data and today's progress - OPTIMIZED
async function getStreakData(req, res) {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      return res.status(400).json({ msg: "User not authenticated" });
    }
    const today = getTodayIST();
    const yesterday = getYesterdayIST();

    // Single query to get both streak and today's activity
    const result = await pool.query(
      `SELECT 
        s.current_streak,
        s.longest_streak,
        s.last_goal_date,
        COALESCE(a.points_earned, 0) as points_earned,
        COALESCE(a.daily_goal_met, false) as daily_goal_met
      FROM (SELECT 1) dummy
      LEFT JOIN user_streak s ON s.user_id = $1
      LEFT JOIN user_daily_activity a ON a.user_id = $1 AND a.activity_date = $2`,
      [userId, today],
    );

    let currentStreak = result.rows[0]?.current_streak ?? 0;
    let longestStreak = result.rows[0]?.longest_streak ?? 0;
    let lastGoalDate = result.rows[0]?.last_goal_date;
    let todayPoints = result.rows[0]?.points_earned ?? 0;
    let dailyGoalMet = result.rows[0]?.daily_goal_met ?? false;

    // Create streak record if doesn't exist
    if (result.rows[0]?.current_streak === null) {
      await pool.query(
        `INSERT INTO user_streak (user_id, current_streak, longest_streak) VALUES ($1, 0, 0)
         ON CONFLICT (user_id) DO NOTHING`,
        [userId],
      );
    }

    // Check if streak should be reset
    if (lastGoalDate) {
      const lastGoalStr = new Date(lastGoalDate).toISOString().split("T")[0];
      if (lastGoalStr !== today && lastGoalStr !== yesterday) {
        currentStreak = 0;
        await pool.query(
          `UPDATE user_streak SET current_streak = 0, streak_updated_at = CURRENT_TIMESTAMP WHERE user_id = $1`,
          [userId],
        );
      }
    }

    res.status(200).json({
      currentStreak,
      longestStreak,
      todayPoints,
      todayFlashcards: todayPoints, // Backward compat: old Capacitor app reads this field
      dailyGoal: 20,
      dailyGoalMet,
      lastGoalDate,
    });
  } catch (err) {
    console.error("Error fetching streak data:", err);
    res.status(500).json({ msg: "Error fetching streak data" });
  }
}

// Log streak points from any module
async function logStreakPoints(req, res) {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      return res.status(400).json({ msg: "User not authenticated" });
    }

    // Accept points from body, default to 1 for backward compatibility
    const points = Math.min(Math.max(parseInt(req.body?.points) || 1, 1), 100);
    const today = getTodayIST();
    const yesterday = getYesterdayIST();

    // Upsert today's activity - increment points_earned
    const activityResult = await pool.query(
      `INSERT INTO user_daily_activity (user_id, activity_date, flashcards_practiced, points_earned)
       VALUES ($1, $2, $3, $3)
       ON CONFLICT (user_id, activity_date)
       DO UPDATE SET 
         points_earned = user_daily_activity.points_earned + $3,
         flashcards_practiced = user_daily_activity.flashcards_practiced + $3,
         updated_at = CURRENT_TIMESTAMP
       RETURNING points_earned, daily_goal_met`,
      [userId, today, points],
    );

    const todayPoints = activityResult.rows[0].points_earned;
    let dailyGoalMet = activityResult.rows[0].daily_goal_met;
    let streakUpdated = false;
    let currentStreak = 0;

    // Check if daily goal just reached (>= 20)
    if (todayPoints >= 20 && !dailyGoalMet) {
      // Mark goal as met
      await pool.query(
        `UPDATE user_daily_activity SET daily_goal_met = true WHERE user_id = $1 AND activity_date = $2`,
        [userId, today],
      );
      dailyGoalMet = true;

      // Update streak
      const streakResult = await pool.query(
        `SELECT * FROM user_streak WHERE user_id = $1`,
        [userId],
      );
      currentStreak = 0;
      let longestStreak = 0;

      if (streakResult.rows.length === 0) {
        currentStreak = 1;
        longestStreak = 1;
        await pool.query(
          `INSERT INTO user_streak (user_id, current_streak, longest_streak, last_goal_date)
           VALUES ($1, 1, 1, $2)`,
          [userId, today],
        );
      } else {
        const lastGoalDate = streakResult.rows[0].last_goal_date;
        currentStreak = streakResult.rows[0].current_streak;
        longestStreak = streakResult.rows[0].longest_streak;

        if (lastGoalDate) {
          const lastGoalStr = new Date(lastGoalDate)
            .toISOString()
            .split("T")[0];

          if (lastGoalStr === yesterday) {
            currentStreak += 1;
          } else if (lastGoalStr === today) {
            if (currentStreak === 0) currentStreak = 1;
          } else {
            currentStreak = 1;
          }
        } else {
          currentStreak = 1;
        }

        if (currentStreak > longestStreak) {
          longestStreak = currentStreak;
        }

        await pool.query(
          `UPDATE user_streak 
           SET current_streak = $1, longest_streak = $2, last_goal_date = $3, streak_updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $4`,
          [currentStreak, longestStreak, today, userId],
        );
      }

      streakUpdated = true;
    }

    res.status(200).json({
      todayPoints,
      todayFlashcards: todayPoints, // Backward compat: old Capacitor app reads this field
      dailyGoal: 20,
      dailyGoalMet,
      streakUpdated,
      currentStreak,
    });
  } catch (err) {
    console.error("Error logging streak points:", err);
    res.status(500).json({ msg: "Error logging activity" });
  }
}

// Get user's first unflipped card in lowest chapter - OPTIMIZED
async function getLastChapterProgress(req, res) {
  try {
    const userId = req.user?.user_id;

    if (!userId) {
      return res.status(400).json({ msg: "User not authenticated" });
    }

    // Get user's proficiency level
    const userResult = await pool.query(
      `SELECT current_profeciency_level FROM app_user WHERE user_id = $1`,
      [userId],
    );

    const profLevel = userResult.rows[0]?.current_profeciency_level || "A1";

    // A2 User - Query A2 flashcard progress from a2_flashcard_progress table
    if (profLevel.toUpperCase() === "A2") {
      const a2Result = await pool.query(
        `SELECT 
          s.set_id,
          s.set_name,
          s.chapter_id,
          (SELECT COUNT(*) FROM a2_flashcard WHERE set_id = s.set_id) as total_cards,
          COALESCE(p.current_index, 0) as current_index
        FROM a2_flashcard_set s
        LEFT JOIN a2_flashcard_progress p ON p.set_id = s.set_id AND p.user_id = $1
        ORDER BY s.set_id ASC`,
        [userId],
      );

      // Find first incomplete set
      const incompleteSet = a2Result.rows.find(
        (s) => s.current_index < s.total_cards,
      );

      if (!incompleteSet) {
        return res.status(200).json({ hasProgress: false });
      }

      return res.status(200).json({
        hasProgress: true,
        chapterId: incompleteSet.chapter_id,
        chapterName: incompleteSet.set_name,
        currentIndex: incompleteSet.current_index,
        totalCards: incompleteSet.total_cards,
        proficiencyLevel: "A2",
        isA2: true,
      });
    }

    // A1 User - Original query
    const result = await pool.query(
      `WITH chapter_stats AS (
        SELECT 
          f.set_id,
          f.set_name,
          f.number_of_cards,
          f.proficiency_level,
          COALESCE(fc.flipped_count, 0) as flipped_count
        FROM flash_card_set f
        LEFT JOIN (
          SELECT set_id, COUNT(*) as flipped_count
          FROM user_flipped_cards
          WHERE user_id = $1
          GROUP BY set_id
        ) fc ON f.set_id = fc.set_id
        WHERE f.proficiency_level = $2
      )
      SELECT * FROM chapter_stats
      WHERE flipped_count < number_of_cards
      ORDER BY (regexp_replace(set_name, '[^0-9]', '', 'g'))::int ASC NULLS LAST
      LIMIT 1`,
      [userId, profLevel],
    );

    if (result.rows.length === 0) {
      return res.status(200).json({ hasProgress: false });
    }
    const chapter = result.rows[0];

    const unflippedResult = await pool.query(
      `SELECT MIN(idx) as first_unflipped
       FROM generate_series(0, $1 - 1) as idx
       WHERE idx NOT IN (
         SELECT card_index FROM user_flipped_cards 
         WHERE user_id = $2 AND set_id = $3
       )`,
      [chapter.number_of_cards, userId, chapter.set_id],
    );

    const firstUnflipped = unflippedResult.rows[0]?.first_unflipped ?? 0;

    res.status(200).json({
      hasProgress: true,
      setId: chapter.set_id,
      setName: chapter.set_name,
      currentIndex: firstUnflipped,
      totalCards: chapter.number_of_cards,
      proficiencyLevel: chapter.proficiency_level,
      isA2: false,
    });
  } catch (err) {
    console.error("Error fetching last chapter:", err);
    res.status(500).json({ msg: "Error fetching last chapter" });
  }
}

async function saveFlippedCard(req, res) {
  try {
    const userId = req.user?.user_id;
    const { set_id, card_index } = req.body;

    if (!userId || set_id === undefined || card_index === undefined) {
      return res.status(400).json({ msg: "Missing required fields" });
    }
    // Save the flipped card record
    const result = await pool.query(
      `INSERT INTO user_flipped_cards (user_id, set_id, card_index)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, set_id, card_index) DO NOTHING
       RETURNING *`,
      [userId, set_id, card_index],
    );

    // Only log a point if the card was actually new (not a duplicate)
    if (result.rowCount > 0) {
      const today = getTodayIST();
      const yesterday = getYesterdayIST();

      const activityResult = await pool.query(
        `INSERT INTO user_daily_activity (user_id, activity_date, flashcards_practiced, points_earned)
         VALUES ($1, $2, 1, 1)
         ON CONFLICT (user_id, activity_date)
         DO UPDATE SET
           points_earned = user_daily_activity.points_earned + 1,
           flashcards_practiced = user_daily_activity.flashcards_practiced + 1,
           updated_at = CURRENT_TIMESTAMP
         RETURNING points_earned, daily_goal_met`,
        [userId, today],
      );

      const todayPoints = activityResult.rows[0].points_earned;
      const dailyGoalMet = activityResult.rows[0].daily_goal_met;

      // Check if daily goal just reached — update streak (same logic as logStreakPoints)
      if (todayPoints >= 20 && !dailyGoalMet) {
        await pool.query(
          `UPDATE user_daily_activity SET daily_goal_met = true WHERE user_id = $1 AND activity_date = $2`,
          [userId, today],
        );

        const streakResult = await pool.query(
          `SELECT * FROM user_streak WHERE user_id = $1`,
          [userId],
        );

        let currentStreak = 0;
        let longestStreak = 0;

        if (streakResult.rows.length === 0) {
          await pool.query(
            `INSERT INTO user_streak (user_id, current_streak, longest_streak, last_goal_date)
             VALUES ($1, 1, 1, $2)`,
            [userId, today],
          );
        } else {
          const lastGoalDate = streakResult.rows[0].last_goal_date;
          currentStreak = streakResult.rows[0].current_streak;
          longestStreak = streakResult.rows[0].longest_streak;

          if (lastGoalDate) {
            const lastGoalStr = new Date(lastGoalDate)
              .toISOString()
              .split("T")[0];
            if (lastGoalStr === yesterday) {
              currentStreak += 1;
            } else if (lastGoalStr === today) {
              if (currentStreak === 0) currentStreak = 1;
            } else {
              currentStreak = 1;
            }
          } else {
            currentStreak = 1;
          }

          if (currentStreak > longestStreak) longestStreak = currentStreak;

          await pool.query(
            `UPDATE user_streak
             SET current_streak = $1, longest_streak = $2, last_goal_date = $3, streak_updated_at = CURRENT_TIMESTAMP
             WHERE user_id = $4`,
            [currentStreak, longestStreak, today, userId],
          );
        }
      }
    }

    res.status(200).json({ msg: "Flipped card saved" });
  } catch (err) {
    console.error("Error saving flipped card:", err);
    res.status(500).json({ msg: "Error saving flipped card" });
  }
}

module.exports = {
  getStreakData,
  logStreakPoints,
  getLastChapterProgress,
  saveFlippedCard,
};
