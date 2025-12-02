const { generateResumePDF } = require("../services/resumePdfService");
exports.generateResumePDF = async (req, res) => {
  try {
    const { resumeData } = req.body;
    if (!resumeData || !resumeData.personalInfo) {
      return res.status(400).json({
        error: "Invalid resume data. personalInfo is required.",
      });
    }
    console.log("Generating PDF for:", resumeData.personalInfo.firstName);
    // Generate PDF using PDFKit
    const pdfBuffer = await generateResumePDF(resumeData);
    // Set response headers
    const fileName = `${resumeData.personalInfo.firstName || "Resume"}_${
      resumeData.personalInfo.lastName || ""
    }_Resume.pdf`.replace(/\s+/g, "_");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    // Send PDF
    res.send(pdfBuffer);
    console.log("PDF generated successfully:", fileName);
  } catch (error) {
    console.error("PDF Generation Error:", error);
    res.status(500).json({
      error: "Failed to generate PDF",
      message: error.message,
    });
  }
};
