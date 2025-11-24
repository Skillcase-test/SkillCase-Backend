const PDFDocument = require("pdfkit");

const generateAgreementPdf = (data) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const chunks = [];
      // Collect PDF chunks
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // Header
      doc
        .fontSize(20)
        .fillColor("#163B72")
        .text("SKILLCASE EDUCATION PRIVATE LIMITED", { align: "center" })
        .moveDown(0.5);
      doc
        .fontSize(16)
        .fillColor("#EDB843")
        .text("Student Training Agreement and Declaration", { align: "center" })
        .moveDown(1);

      // Agreement confirmation box
      doc
        .fontSize(12)
        .fillColor("#000000")
        .text("AGREEMENT CONFIRMATION", { align: "center", underline: true })
        .moveDown(0.5);
      doc
        .fontSize(10)
        .text(
          `This confirms that the following individual has read, understood, and agreed to`
        )
        .text(
          `the Terms and Conditions of Skillcase Education Private Limited.`
        )
        .moveDown(1);

      // User details box
      doc.rect(50, doc.y, 495, 100).stroke();
      const boxY = doc.y + 15;

      doc.fontSize(11).font("Helvetica-Bold").text("Student Name:", 70, boxY);
      doc.font("Helvetica").text(data.name, 200, boxY);
      doc.font("Helvetica-Bold").text("Email Address:", 70, boxY + 25);
      doc.font("Helvetica").text(data.email, 200, boxY + 25);
      doc.font("Helvetica-Bold").text("Phone Number:", 70, boxY + 50);
      doc.font("Helvetica").text(data.phoneNumber, 200, boxY + 50);
      doc.font("Helvetica-Bold").text("Agreement Date:", 70, boxY + 75);
      doc.font("Helvetica").text(
        new Date(data.date).toLocaleString("en-IN", {
          dateStyle: "long",
          timeStyle: "short",
          timeZone: "Asia/Kolkata",
        }),
        200,
        boxY + 75
      );
      doc.moveDown(7);

      // Terms and Conditions content
      doc
        .fontSize(14)
        .fillColor("#163B72")
        .text("TERMS AND CONDITIONS", { underline: true })
        .moveDown(0.5);
      const sections = [
        {
          title: "1. Course Duration and Learning Progress",
          content:
            "The time required to complete each language level (A1 to B2) depends on the Student's individual learning capacity, consistency, and personal effort. The Institution does not guarantee completion of any level within a fixed duration, as progress may vary.",
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
      doc.fontSize(9).fillColor("#000000");
      sections.forEach((section) => {
        if (doc.y > 700) {
          doc.addPage();
        }
        doc
          .font("Helvetica-Bold")
          .text(section.title, { continued: false })
          .moveDown(0.3);
        doc
          .font("Helvetica")
          .text(section.content, { align: "justify" })
          .moveDown(0.8);
      });

      // Declaration
      if (doc.y > 650) {
        doc.addPage();
      }
      doc.moveDown(1);
      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .fillColor("#163B72")
        .text("STUDENT DECLARATION", { underline: true })
        .moveDown(0.5);
      doc
        .fontSize(9)
        .font("Helvetica")
        .fillColor("#000000")
        .text(
          "I hereby declare that I have read, understood, and agree to the above terms and conditions. This document serves as proof of my acceptance."
        )
        .moveDown(2);

      // Footer
      doc
        .fontSize(8)
        .fillColor("#666666")
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
    } catch (error) {
      console.log("Error in generateAgreementPdf service: ", error.message);
      reject(error);
    }
  });
};

module.exports = generateAgreementPdf;
