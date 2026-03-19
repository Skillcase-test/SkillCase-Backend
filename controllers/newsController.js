const { pool } = require("../util/db");

const normalizeLang = (lang = "de") => {
  const value = String(lang).toLowerCase();
  return value.startsWith("en") ? "en" : "de";
};

const normalizeLevel = (level = "ALL") => {
  const value = String(level).toUpperCase();
  if (value === "A1" || value === "A2") return value;
  return "ALL";
};

const mapNewsRow = (row, lang = "de") => {
  const useEnglish = lang === "en";
  const title = useEnglish
    ? row.english_title
    : row.german_title || row.english_title;
  const summary = useEnglish
    ? row.english_summary
    : row.german_summary || row.english_summary;
  const content = useEnglish
    ? row.english_content
    : row.german_content || row.english_content;

  return {
    id: row.id,
    sourceName: row.source_name,
    articleUrl: row.article_url,
    imageUrl: row.image_url,
    publishedAt: row.published_at,
    targetLevels: row.target_levels,
    title,
    summary,
    content,
    english: {
      title: row.english_title,
      summary: row.english_summary,
      content: row.english_content,
    },
    german: {
      title: row.german_title || row.english_title,
      summary: row.german_summary || row.english_summary,
      content: row.german_content || row.english_content,
    },
  };
};

const getNewsFeed = async (req, res) => {
  const lang = normalizeLang(req.query.lang || "de");
  const level = normalizeLevel(req.query.level || "ALL");
  const limit = Math.min(Math.max(Number(req.query.limit || 10), 1), 30);

  try {
    const params = [limit];
    let levelClause = "";

    if (level !== "ALL") {
      params.push(level);
      levelClause =
        "AND ($2 = ANY(target_levels) OR 'ALL' = ANY(target_levels))";
    }

    const query = `
      SELECT
        id,
        source_name,
        article_url,
        image_url,
        published_at,
        target_levels,
        english_title,
        english_summary,
        english_content,
        german_title,
        german_summary,
        german_content
      FROM news_article
      WHERE is_active = TRUE
      ${levelClause}
      ORDER BY published_at DESC NULLS LAST, created_at DESC
      LIMIT $1
    `;

    const result = await pool.query(query, params);

    return res.status(200).json({
      message: "News fetched",
      data: result.rows.map((row) => mapNewsRow(row, lang)),
      meta: { lang, level, count: result.rows.length },
    });
  } catch (error) {
    console.error("Error in getNewsFeed:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const getNewsById = async (req, res) => {
  const lang = normalizeLang(req.query.lang || "de");
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ message: "News id is required" });
  }

  try {
    const query = `
      SELECT
        id,
        source_name,
        article_url,
        image_url,
        published_at,
        target_levels,
        english_title,
        english_summary,
        english_content,
        german_title,
        german_summary,
        german_content
      FROM news_article
      WHERE id = $1 AND is_active = TRUE
      LIMIT 1
    `;

    const result = await pool.query(query, [id]);

    if (!result.rows.length) {
      return res.status(404).json({ message: "News article not found" });
    }

    return res.status(200).json({
      message: "News article fetched",
      data: mapNewsRow(result.rows[0], lang),
      meta: { lang },
    });
  } catch (error) {
    console.error("Error in getNewsById:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  getNewsFeed,
  getNewsById,
};
