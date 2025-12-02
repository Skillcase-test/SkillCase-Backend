const { pool } = require("../util/db");
const { extractResumeFromPDF } = require("../services/geminiPdfExtractor");

const extractResume = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded!" });
    }

    const pdfBuffer = req.file.buffer;
    // Extract resume data directly from PDF using Gemini's PDF processing
    const resumeData = await extractResumeFromPDF(pdfBuffer);

    return res.status(200).json({
      success: true,
      message: "Resume extracted successfully",
      data: resumeData,
    });
  } catch (error) {
    console.log("Error in extractResume controller: ", error.message);
    return res.status(500).json({ message: "Failed to extract resume data" });
  }
};

const saveResume = async (req, res) => {
  try {
    const { user_id } = req.user;
    const { resumeData } = req.body;

    if (!resumeData) {
      return res.status(400).json({ message: "Resume data is required!" });
    }

    const userCheck = await pool.query(
      "SELECT user_id, username FROM app_user WHERE user_id = $1",
      [user_id]
    );

    

    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        message: "User not found in database. Please log in again.",
        debug: {
          user_id_from_token: user_id,
          user_exists: false,
        },
      });
    }

    const firstName = resumeData.personalInfo?.firstName || "User";
    const lastName = resumeData.personalInfo?.lastName || "";
    const timestamp = new Date().toISOString().split("T")[0];
    const resumeName = `${firstName} ${lastName} Resume - ${timestamp}`.trim();

    const result = await pool.query(
      `INSERT INTO resume (user_id, resume_name, resume_data, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       RETURNING resume_id, resume_name, created_at`,
      [user_id, resumeName, JSON.stringify(resumeData)]
    );

    res.status(201).json({
      success: true,
      message: "Resume saved successfully!",
      data: result.rows[0],
    });
  } catch (error) {
    console.log("Error in saveResume controller:", error.message);
    console.log("Full error:", error);
    if (error.message.includes("foreign key constraint")) {
      return res.status(400).json({
        message:
          "User not found. Please make sure you're logged in with a valid account.",
        error: error.message,
      });
    }
    return res.status(500).json({ message: "Failed to save resume" });
  }
};

const listResumes = async (req, res) => {
  try {
    const { user_id } = req.user;
    const result = await pool.query(
      `SELECT resume_id, resume_name, created_at, updated_at
       FROM resume
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [user_id]
    );
    res.status(200).json({
      success: true,
      message: "list retrived successfully!",
      count: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    console.log("Error in listResumes controller: ", error.message);
    return res.status(500).json({ message: "Failed to list resumes" });
  }
};

const getResume = async (req, res) => {
  try {
    const { user_id } = req.user;
    const { resume_id } = req.params;
    const result = await pool.query(
      `SELECT resume_id, resume_name, resume_data, created_at, updated_at
       FROM resume
       WHERE user_id = $1 AND resume_id = $2
       `,
      [user_id, resume_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Resume not found!" });
    }

    res.status(200).json({
      success: true,
      message: "Resume retrived successfully!",
      data: result.rows[0],
    });
  } catch (error) {
    console.log("Error in getResume controller: ", error.message);
    return res.status(500).json({ message: "Failed to get your resume" });
  }
};

const updateResume = async (req, res) => {
  try {
    const { user_id } = req.user;
    const { resume_id } = req.params;
    const { resumeData, resumeName } = req.body;
    if (!resumeData) {
      return res.status(400).json({ message: "Resume data is required!" });
    }

    let query = `UPDATE resume SET resume_data= $1, updated_at = NOW()`;
    let params = [JSON.stringify(resumeData)];
    let paramIdx = 2;

    if (resumeName) {
      query += `, resume_name=$${paramIdx}`;
      params.push(resumeName);
      paramIdx++;
    }

    query += ` WHERE resume_id=$${paramIdx} AND user_id = $${
      paramIdx + 1
    } RETURNING resume_id, resume_name, updated_at`;
    params.push(resume_id, user_id);

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Resume not found!" });
    }

    res.status(200).json({
      success: true,
      message: "Resume updated successfully!",
      data: result.rows[0],
    });
  } catch (error) {
    console.log("Error in updateResume controller: ", error.message);
    return res.status(500).json({ message: "Failed to update your resume" });
  }
};

const deleteResume = async (req, res) => {
  try {
    const { user_id } = req.user;
    const { resume_id } = req.params;

    const result = await pool.query(
      `DELETE FROM resume WHERE resume_id=$1 AND user_id = $2 RETURNING resume_id`,
      [resume_id, user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Resume not found!" });
    }

    res.status(200).json({
      success: true,
      message: "Resume deleted successfully!",
    });
  } catch (error) {
    console.log("Error in deleteResume controller: ", error.message);
    return res.status(500).json({ message: "Failed to delete your resume" });
  }
};

module.exports = {
  extractResume,
  saveResume,
  listResumes,
  getResume,
  updateResume,
  deleteResume,
};
