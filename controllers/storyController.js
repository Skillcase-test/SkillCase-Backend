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

// CREATE - Add new story
const createStory = async (req, res) => {
  const { slug, title, description, coverImageUrl, heroImageUrl, story } =
    req.body;
  // Validation
  if (!slug || !title || !story) {
    return res.status(400).json({
      message: "Missing required fields: slug, title, and story are required",
    });
  }
  try {
    const query = `
      INSERT INTO story (slug, title, description, cover_image_url, hero_image_url, story)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING 
        story_id,
        slug,
        title,
        description,
        cover_image_url AS "coverImageUrl",
        hero_image_url AS "heroImageUrl",
        story,
        created_at AS "createdAt",
        modified_at AS "modifiedAt"
    `;
    const result = await pool.query(query, [
      slug,
      title,
      description || "",
      coverImageUrl || "",
      heroImageUrl || "",
      story,
    ]);
    return res.status(201).json({
      message: "Story created successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error in createStory:", error.message);

    // Handle duplicate slug
    if (error.code === "23505") {
      return res.status(409).json({
        message: "Story with this slug already exists",
      });
    }

    return res.status(500).json({ message: "Internal server error" });
  }
};
// UPDATE - Edit existing story
const updateStory = async (req, res) => {
  const { slug } = req.params;
  const { title, description, coverImageUrl, heroImageUrl, story, newSlug } =
    req.body;
  try {
    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramCount = 1;
    if (newSlug) {
      updates.push(`slug = $${paramCount++}`);
      values.push(newSlug);
    }
    if (title) {
      updates.push(`title = $${paramCount++}`);
      values.push(title);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(description);
    }
    if (coverImageUrl !== undefined) {
      updates.push(`cover_image_url = $${paramCount++}`);
      values.push(coverImageUrl);
    }
    if (heroImageUrl !== undefined) {
      updates.push(`hero_image_url = $${paramCount++}`);
      values.push(heroImageUrl);
    }
    if (story) {
      updates.push(`story = $${paramCount++}`);
      values.push(story);
    }
    if (updates.length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }
    updates.push(`modified_at = CURRENT_TIMESTAMP`);
    values.push(slug);
    const query = `
      UPDATE story
      SET ${updates.join(", ")}
      WHERE slug = $${paramCount}
      RETURNING 
        story_id,
        slug,
        title,
        description,
        cover_image_url AS "coverImageUrl",
        hero_image_url AS "heroImageUrl",
        story,
        created_at AS "createdAt",
        modified_at AS "modifiedAt"
    `;
    const result = await pool.query(query, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Story not found" });
    }
    return res.status(200).json({
      message: "Story updated successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error in updateStory:", error.message);

    if (error.code === "23505") {
      return res.status(409).json({
        message: "Story with this slug already exists",
      });
    }

    return res.status(500).json({ message: "Internal server error" });
  }
};
// DELETE - Remove story
const deleteStory = async (req, res) => {
  const { slug } = req.params;
  try {
    const query = `
      DELETE FROM story
      WHERE slug = $1
      RETURNING story_id, slug, title
    `;
    const result = await pool.query(query, [slug]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Story not found" });
    }
    return res.status(200).json({
      message: "Story deleted successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error in deleteStory:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  getStories,
  getStoryBySlug,
  createStory,
  updateStory,
  deleteStory,
};
