const PDFDocument = require("pdfkit");

const generateAgreementPdf = (data) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const chunks = [];

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      /* -------------------------------- HEADER -------------------------------- */
      doc
        .fontSize(20)
        .fillColor("#163B72")
        .text("SKILLCASE EDUCATION PRIVATE LIMITED", { align: "center" })
        .moveDown(0.3);

      doc
        .fontSize(15)
        .fillColor("#EDB843")
        .text("Student Training Agreement and Declaration", {
          align: "center",
        })
        .moveDown(1.2);

      /* ---------------------- AGREEMENT CONFIRMATION HEADER ---------------------- */
      doc
        .fontSize(12)
        .fillColor("#000")
        .text("AGREEMENT CONFIRMATION", { align: "center", underline: true })
        .moveDown(0.6);

      doc
        .fontSize(10)
        .text(
          "This confirms that the following individual has read, understood, and agreed to the Terms and Conditions of Skillcase Education Private Limited.",
          { align: "center" }
        )
        .moveDown(1);

      /* ----------------------------- DETAILS BOX ----------------------------- */
      const boxX = 50;
      const boxWidth = 495;
      const paddingX = 65; // LEFT PADDING
      const startY = doc.y;

      doc.rect(boxX, startY, boxWidth, 0).stroke();

      doc.moveDown(0.6);

      // Use padded X to start writing inside the box
      doc.fontSize(11).font("Helvetica-Bold").text("Student Name:", paddingX);
      doc.font("Helvetica").text(data.name, paddingX).moveDown(0.4);

      doc.font("Helvetica-Bold").text("Email Address:", paddingX);
      doc.font("Helvetica").text(data.email, paddingX).moveDown(0.4);

      doc.font("Helvetica-Bold").text("Phone Number:", paddingX);
      doc.font("Helvetica").text(data.phoneNumber, paddingX).moveDown(0.4);

      doc.font("Helvetica-Bold").text("Agreement Date:", paddingX);
      doc.font("Helvetica").text(
        new Date(data.date).toLocaleString("en-IN", {
          dateStyle: "long",
          timeStyle: "short",
          timeZone: "Asia/Kolkata",
        }),
        paddingX
      );

      // Close box height based on final Y
      const endY = doc.y + 10;
      doc.rect(boxX, startY, boxWidth, endY - startY).stroke();

      doc.moveDown(2);

      /* -------------------------- TERMS & CONDITIONS -------------------------- */
      doc
        .fontSize(14)
        .fillColor("#163B72")
        .text("TERMS AND CONDITIONS", { underline: true })
        .moveDown(0.8);

      const sections = [
        {
          title: "1. Course Duration and Learning Progress",
          content:
            "The time required to complete each language level depends on the Student's individual learning capacity, consistency, and personal effort. The Institution does not guarantee completion of any level within a fixed duration, as progress may vary.",
        },
        {
          title: "2. Attendance and Participation",
          content:
            "Regular attendance and active participation are mandatory. The Institution reserves the right to restrict or discontinue class access due to prolonged absenteeism, misconduct, or non-participation, without refund or compensation.",
        },
        {
          title: "3. Fees, Refunds, and Cancellation",
          content:
            "All fees paid are non-refundable and non-transferable. Refunds will only be issued if the Institution cancels the course. No refund shall be provided in cases of partial attendance, voluntary withdrawal, absenteeism, or removal due to disciplinary issues.",
        },
        {
          title: "4. Code of Conduct and Discipline",
          content:
            "The Student must maintain respectful communication and professional conduct in all sessions. Any form of disruptive, abusive, or inappropriate behavior may result in suspension or termination from the program without refund.",
        },
        {
          title: "5. Technical Requirements",
          content:
            "The Student is responsible for ensuring stable internet access, a functioning device, and the ability to attend online classes. Missed sessions due to personal technical issues will not be rescheduled or compensated.",
        },
        {
          title: "6. Intellectual Property and Content Usage",
          content:
            "All course materials, class recordings, documents, and resources are the property of the Institution and are provided solely for the Student's personal learning. Copying, sharing, distributing, or commercial use of such materials is strictly prohibited.",
        },
        {
          title: "7. Job Placement Assistance",
          content:
            "Skillcase Education provides job matching assistance, interview preparation, documentation guidance, and coordination with employers. However, no guarantee of job placement, employment offer, visa issuance, or migration approval is provided.",
        },
        {
          title: "8. Limitation of Liability",
          content:
            "The Institution shall not be liable for direct, indirect, or consequential losses, including employment expectations, financial decisions, travel plans, or migration outcomes.",
        },
      ];

      doc.fontSize(10).fillColor("#000");

      sections.forEach((section) => {
        if (doc.y > 690) {
          doc.addPage();
          doc.moveDown(0.2); // minimal space, prevents large gaps
        }

        doc.font("Helvetica-Bold").text(section.title).moveDown(0.2);

        doc
          .font("Helvetica")
          .text(section.content, { align: "justify", lineGap: 2 })
          .moveDown(1);
      });

      /* ------------------------------- DECLARATION ------------------------------ */
      if (doc.y > 690) {
        doc.addPage();
        doc.moveDown(0.2);
      }

      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .fillColor("#163B72")
        .text("STUDENT DECLARATION", { underline: true })
        .moveDown(0.6);

      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor("#000")
        .text(
          "I hereby declare that I have read, understood, and agree to the above terms and conditions. This document serves as proof of my acceptance.",
          { lineGap: 2 }
        )
        .moveDown(2);

      /* --------------------------------- FOOTER -------------------------------- */
      doc
        .fontSize(8)
        .fillColor("#666")
        .text(
          `Document generated on: ${new Date().toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
          })}`,
          { align: "center" }
        )
        .moveDown(0.3)
        .text(
          "This is a system-generated document and does not require a physical signature.",
          { align: "center" }
        );

      doc.end();
    } catch (err) {
      console.log("Error in generateAgreementPdf service: ", error.message);
      reject(err);
    }
  });
};

module.exports = generateAgreementPdf;
