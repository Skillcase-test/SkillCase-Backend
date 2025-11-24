const { pool } = require("../util/db");

const getStories = async (req, res) => {
  try {
    const query = `
      SELECT 
        story_id,
        slug,
        title,
        description,
        cover_image_url AS "coverImageUrl",
        hero_image_url AS "heroImageUrl",
        story,
        created_at AS "createdAt",
        modified_at AS "modifiedAt"
      FROM story
      ORDER BY created_at DESC
    `;

    const result = await pool.query(query);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "No stories found" });
    }
    return res.status(200).json({
      message: "Stories fetched",
      data: result.rows,
    });
  } catch (error) {
    console.error("Error in getStories controller:", error.message);
    return res.status(500).json({ message: "Internal server error!" });
  }
};

const getStoryBySlug = async (req, res) => {
  const { slug } = req.params;

  try {
    const query = `
      SELECT 
        story_id,
        slug,
        title,
        description,
        cover_image_url AS "coverImageUrl",
        hero_image_url AS "heroImageUrl",
        story,
        created_at AS "createdAt",
        modified_at AS "modifiedAt"
      FROM story
      WHERE slug = $1
    `;

    const result = await pool.query(query, [slug]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Requested story not found!" });
    }
    return res.status(200).json({
      message: "Story fetched!",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error in getStoryBySlug controller:", error.message);
    return res.status(500).json({ message: "Internal server error!" });
  }
};
module.exports = { getStories, getStoryBySlug };
