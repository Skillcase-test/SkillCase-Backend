const PDFDocument = require("pdfkit");
const axios = require("axios");
const path = require("path");
const fs = require("fs");

/**
 * Helper function to download image from URL
 */
async function downloadImage(url) {
  try {
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 10000, // 10 second timeout
      maxContentLength: 5 * 1024 * 1024, // 5MB max
    });

    // Validate content type
    const contentType = response.headers["content-type"];
    if (!contentType || !contentType.startsWith("image/")) {
      throw new Error("URL does not point to an image");
    }

    return Buffer.from(response.data);
  } catch (error) {
    console.error("Image download failed:", error.message);
    return null;
  }
}

/**
 * Generate Europass-style resume PDF from resume data
 * @param {Object} resumeData - Resume data object
 * @returns {Promise<Buffer>} - PDF buffer
 */
async function generateResumePDF(resumeData) {
  return new Promise(async (resolve, reject) => {
    try {
      // Create PDF document
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        bufferPages: true,
      });

      // Collect PDF chunks
      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // A4 dimensions
      const pageWidth = 595.28; // A4 width in points
      const pageHeight = 841.89; // A4 height in points
      const sidebarWidth = pageWidth * 0.3; // 30% for sidebar
      const contentWidth = pageWidth * 0.7; // 70% for content

      // Colors
      const sidebarColor = "#fafafa";
      const accentColor = "#003399";
      const textColor = "#000000";

      // Helper function to draw sidebar background on each page
      function drawSidebarBackground() {
        doc.rect(0, 0, sidebarWidth, pageHeight).fill(sidebarColor);

        // Vertical line separator
        doc
          .strokeColor("#e5e7eb")
          .lineWidth(1)
          .moveTo(sidebarWidth, 0)
          .lineTo(sidebarWidth, pageHeight)
          .stroke();
      }

      // Draw initial sidebar
      drawSidebarBackground();

      // ===== SKILLCASE LOGO (Top Right) =====
      try {
        const logoPath = path.join(__dirname, "../public/mainlogo.png");
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, pageWidth - 110, -10, {
            width: 90,
            fit: [90, 35],
          });
        }
      } catch (err) {
        console.log("Could not load Skillcase logo:", err.message);
      }

      // ===== LEFT SIDEBAR =====
      let sidebarY = 40;
      const sidebarX = 30;
      const sidebarContentWidth = sidebarWidth - 60;

      // Profile Photo (if exists)
      if (resumeData.personalInfo?.profilePhoto) {
        try {
          let imageBuffer;

          if (resumeData.personalInfo.profilePhoto.startsWith("http")) {
            // Download remote image (Cloudinary)
            console.log(
              "Downloading profile photo from:",
              resumeData.personalInfo.profilePhoto
            );
            imageBuffer = await downloadImage(
              resumeData.personalInfo.profilePhoto
            );
          } else {
            // Local file
            if (fs.existsSync(resumeData.personalInfo.profilePhoto)) {
              imageBuffer = fs.readFileSync(
                resumeData.personalInfo.profilePhoto
              );
            }
          }

          if (imageBuffer) {
            // Create circular clipping path for round photo
            const photoSize = 80;
            const photoX = sidebarX + (sidebarContentWidth - photoSize) / 2;
            const photoY = sidebarY;
            const centerX = photoX + photoSize / 2;
            const centerY = photoY + photoSize / 2;
            const radius = photoSize / 2;

            // Save the current graphics state
            doc.save();

            // Create circular clipping path
            doc.circle(centerX, centerY, radius).clip();

            // Draw the image (will be clipped to circle)
            doc.image(imageBuffer, photoX, photoY, {
              width: photoSize,
              height: photoSize,
              fit: [photoSize, photoSize],
            });

            // Restore graphics state
            doc.restore();

            sidebarY += 90;
          } else {
            sidebarY += 10; // Small gap if image failed
          }
        } catch (err) {
          console.log("Could not load profile photo:", err.message);
          sidebarY += 10;
        }
      }

      // Name
      const fullName = `${resumeData.personalInfo?.firstName || ""} ${
        resumeData.personalInfo?.lastName || ""
      }`.trim();
      doc
        .fillColor(textColor)
        .fontSize(18)
        .font("Helvetica-Bold")
        .text(fullName, sidebarX, sidebarY, {
          width: sidebarContentWidth,
          align: "center",
        });
      sidebarY += 50; // Increased gap between name and contact info

      // Contact Information
      const contactItems = [
        { label: "Nationality", value: resumeData.personalInfo?.nationality },
        { label: "Phone number", value: resumeData.personalInfo?.phone },
        { label: "Email address", value: resumeData.personalInfo?.email },
        { label: "LinkedIn", value: resumeData.personalInfo?.linkedin },
        { label: "Address", value: resumeData.personalInfo?.address },
      ];

      contactItems.forEach((item) => {
        if (item.value) {
          // Label
          doc
            .fontSize(9)
            .font("Helvetica-Bold")
            .fillColor(textColor)
            .text(`${item.label}:`, sidebarX, sidebarY, {
              width: sidebarContentWidth,
            });
          sidebarY += 12;
          // Value
          doc
            .fontSize(9)
            .font("Helvetica")
            .text(item.value, sidebarX, sidebarY, {
              width: sidebarContentWidth,
            });
          sidebarY += 20;
        }
      });

      // ===== RIGHT CONTENT AREA =====
      let contentY = 60; // Start below logo area
      const contentX = sidebarWidth + 40;
      const contentAreaWidth = contentWidth - 80;

      // Helper function to add section title
      function addSectionTitle(title, y) {
        doc
          .fontSize(12)
          .font("Helvetica-Bold")
          .fillColor(textColor)
          .text(title, contentX, y, {
            width: contentAreaWidth,
          });
        return y + 20;
      }

      // Helper function to check if new page is needed
      function checkNewPage(currentY, requiredSpace = 100) {
        if (currentY + requiredSpace > pageHeight - 40) {
          doc.addPage();
          drawSidebarBackground();
          return 40; // Reset Y to top of new page
        }
        return currentY;
      }

      // ABOUT ME Section
      if (resumeData.personalInfo?.aboutMe) {
        contentY = addSectionTitle("ABOUT ME", contentY);

        doc
          .fontSize(10)
          .font("Helvetica")
          .fillColor(textColor)
          .text(resumeData.personalInfo.aboutMe, contentX, contentY, {
            width: contentAreaWidth,
            align: "justify",
          });

        contentY +=
          doc.heightOfString(resumeData.personalInfo.aboutMe, {
            width: contentAreaWidth,
          }) + 25;
      }

      // ===== GLOBAL TIMELINE SETTINGS =====
      // This ensures the blue line and text alignment are consistent across Education & Exp
      const timelineX = contentX + 5;
      const textPadding = 20;
      const textX = timelineX + textPadding;
      const contentMaxWidth = contentAreaWidth - textPadding;

      // EDUCATION SECTION (Fixed Layout)
      if (resumeData.education?.length > 0) {
        contentY = checkNewPage(contentY, 80);
        contentY = addSectionTitle("EDUCATION AND TRAINING", contentY);
        contentY += 10; // Gap after title

        resumeData.education.forEach((edu) => {
          // Check for page break
          contentY = checkNewPage(contentY, 60);

          const itemStartY = contentY; // Mark start for the line

          // 1. Date & Location (Blue Text)
          const dateText = `${edu.startYear || ""} – ${edu.endYear || ""}`;
          const fullDateLocation = edu.location
            ? `${dateText} – ${edu.location}`
            : dateText;

          doc
            .fontSize(9)
            .font("Helvetica-Bold")
            .fillColor(accentColor)
            .text(fullDateLocation, textX, contentY, {
              width: contentMaxWidth,
            });
          contentY += 14;

          // 2. Dot Position (Aligned with Degree Title)
          const dotY = contentY + 5;

          // 3. Degree Title
          doc
            .fontSize(11)
            .font("Helvetica-Bold")
            .fillColor(textColor)
            .text(edu.degree || "", textX, contentY, {
              width: contentMaxWidth,
            });
          contentY +=
            doc.heightOfString(edu.degree || "", { width: contentMaxWidth }) +
            2;

          // 4. Institution
          doc
            .fontSize(10)
            .font("Helvetica")
            .text(edu.institution || "", textX, contentY, {
              width: contentMaxWidth,
            });
          contentY +=
            doc.heightOfString(edu.institution || "", {
              width: contentMaxWidth,
            }) + 10;

          const itemEndY = contentY; // Mark end for the line

          // Draw the continuous line
          doc
            .save()
            .strokeColor(accentColor)
            .lineWidth(2)
            .moveTo(timelineX, itemStartY)
            .lineTo(timelineX, itemEndY)
            .stroke()
            .restore();

          // Draw the dot
          doc
            .save()
            .fillColor(accentColor)
            .circle(timelineX, dotY, 4.5)
            .fill()
            .restore();

          contentY += 5; // Spacing between items
        });
      }

      // WORK EXPERIENCE SECTION (Fixed Layout)
      if (resumeData.experience?.length > 0) {
        contentY = checkNewPage(contentY, 80);
        contentY = addSectionTitle("WORK EXPERIENCE", contentY);
        contentY += 10;

        resumeData.experience.forEach((exp) => {
          contentY = checkNewPage(contentY, 80);

          const itemStartY = contentY;

          // 1. Date & Location
          const endDate = exp.currentJob ? "PRESENT" : exp.endDate || "";
          const dateText = `${exp.startDate || ""} – ${endDate}`;
          const fullDateLocation = exp.location
            ? `${dateText} – ${exp.location}`
            : dateText;

          doc
            .fontSize(9)
            .font("Helvetica-Bold")
            .fillColor(accentColor)
            .text(fullDateLocation, textX, contentY, {
              width: contentMaxWidth,
            });
          contentY += 14;

          // 2. Dot Position
          const dotY = contentY + 5;

          // 3. Position Title
          doc
            .fontSize(11)
            .font("Helvetica-Bold")
            .fillColor(textColor)
            .text(exp.position || "", textX, contentY, {
              width: contentMaxWidth,
            });
          contentY +=
            doc.heightOfString(exp.position || "", { width: contentMaxWidth }) +
            2;

          // 4. Company
          if (exp.company) {
            doc
              .fontSize(10)
              .font("Helvetica")
              .text(exp.company, textX, contentY, {
                width: contentMaxWidth,
              });
            contentY +=
              doc.heightOfString(exp.company, { width: contentMaxWidth }) + 5;
          }

          // 5. Responsibilities
          if (exp.responsibilities?.length > 0) {
            const responsibilities = Array.isArray(exp.responsibilities)
              ? exp.responsibilities
              : exp.responsibilities.split(".").filter((r) => r.trim());

            responsibilities.forEach((resp) => {
              if (resp.trim()) {
                // Simple page check
                if (contentY + 20 > pageHeight - 40) {
                  doc.addPage();
                  drawSidebarBackground();
                  contentY = 40;
                }

                doc
                  .fontSize(9)
                  .font("Helvetica")
                  .fillColor(textColor)
                  .text(`• ${resp.trim()}`, textX + 10, contentY, {
                    width: contentMaxWidth - 10,
                    align: "justify",
                  });

                contentY +=
                  doc.heightOfString(`• ${resp.trim()}`, {
                    width: contentMaxWidth - 10,
                  }) + 4;
              }
            });
          }

          contentY += 10; // Padding at bottom of item
          const itemEndY = contentY;

          // Draw continuous line
          doc
            .save()
            .strokeColor(accentColor)
            .lineWidth(2)
            .moveTo(timelineX, itemStartY)
            .lineTo(timelineX, itemEndY)
            .stroke()
            .restore();

          // Draw dot
          doc
            .save()
            .fillColor(accentColor)
            .circle(timelineX, dotY, 4.5)
            .fill()
            .restore();

          contentY += 5;
        });
      }

      // LANGUAGE SKILLS Section
      if (resumeData.motherTongue || resumeData.languages?.length > 0) {
        contentY = checkNewPage(contentY, 80);
        contentY = addSectionTitle("LANGUAGE SKILLS", contentY);

        // Mother Tongue
        if (resumeData.motherTongue) {
          doc
            .fontSize(9)
            .font("Helvetica-Bold")
            .fillColor(textColor)
            .text("MOTHER TONGUE(S): ", contentX + 20, contentY, {
              continued: true,
            })
            .font("Helvetica")
            .text(resumeData.motherTongue.toUpperCase());
          contentY += 20;
        }

        // Other Languages
        if (resumeData.languages?.length > 0) {
          const germanLanguages = resumeData.languages.filter((lang) =>
            ["german", "deutsch"].includes(lang.language?.toLowerCase())
          );
          const otherLanguages = resumeData.languages.filter(
            (lang) =>
              !["german", "deutsch"].includes(lang.language?.toLowerCase())
          );

          // Detailed German/Deutsch display
          germanLanguages.forEach((lang) => {
            contentY = checkNewPage(contentY, 60);
            doc
              .fontSize(9)
              .font("Helvetica-Bold")
              .fillColor(textColor)
              .text("OTHER LANGUAGE(S): ", contentX + 20, contentY, {
                continued: true,
              })
              .font("Helvetica")
              .text(lang.language?.toUpperCase() || "");
            contentY += 16;

            const levels = [
              { label: "Reading", value: lang.reading },
              { label: "Speaking", value: lang.speaking },
              { label: "Writing", value: lang.writing },
            ];
            levels.forEach((level) => {
              doc
                .fontSize(9)
                .font("Helvetica-Bold")
                .text(level.label, contentX + 30, contentY, {
                  width: 60,
                  continued: true,
                })
                .font("Helvetica")
                .text(`  ${level.value || "N/A"}`);
              contentY += 12;
            });
            contentY += 10;
          });

          // List other languages
          if (otherLanguages.length > 0) {
            const langList = otherLanguages
              .map((l) => l.language)
              .join(", ")
              .toUpperCase();
            doc
              .fontSize(9)
              .font("Helvetica-Bold")
              .fillColor(textColor)
              .text("OTHER LANGUAGE(S): ", contentX + 20, contentY, {
                continued: true,
              })
              .font("Helvetica")
              .text(langList);
            contentY += 25;
          }
        }
      }

      // SKILLS Section
      const hasSkills =
        resumeData.medicalSkills?.length > 0 ||
        resumeData.skills?.technical?.length > 0 ||
        resumeData.skills?.soft?.length > 0;

      if (hasSkills) {
        contentY = checkNewPage(contentY, 60);
        contentY = addSectionTitle("SKILLS", contentY);
        const allSkills = [
          ...(resumeData.medicalSkills || []),
          ...(resumeData.skills?.technical || []),
          ...(resumeData.skills?.soft || []),
        ];
        const skillsText = allSkills.join(", ");

        doc
          .fontSize(9)
          .font("Helvetica")
          .fillColor(textColor)
          .text(skillsText, contentX + 20, contentY, {
            width: contentAreaWidth - 20,
          });
        contentY +=
          doc.heightOfString(skillsText, {
            width: contentAreaWidth - 20,
          }) + 25;
      }

      // HOBBIES Section
      if (resumeData.hobbies) {
        contentY = checkNewPage(contentY, 60);
        contentY = addSectionTitle("HOBBIES AND INTERESTS", contentY);
        const hobbiesText = Array.isArray(resumeData.hobbies)
          ? resumeData.hobbies.join(", ")
          : resumeData.hobbies;
        doc
          .fontSize(9)
          .font("Helvetica")
          .fillColor(textColor)
          .text(hobbiesText, contentX + 20, contentY, {
            width: contentAreaWidth - 20,
          });
      }

      // Finalize PDF
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = { generateResumePDF };
