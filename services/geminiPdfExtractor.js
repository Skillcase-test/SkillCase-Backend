const { getGeminiClient, geminiConfig } = require("../config/gemini");

const extractResumeFromPDF = async (pdfBuffer) => {
  const genAI = getGeminiClient();
  if (!genAI) {
    throw new Error("Gemini not initialized");
  }

  const prompt = `
You are an expert resume parser with visual understanding of PDF layouts.
Analyze this resume PDF and extract ALL information into the specified JSON format.

### CRITICAL RULES:
1. **VISUAL LAYOUT AWARENESS**: You can see the PDF layout - use column positions, tables, and formatting to correctly associate data.
2. **ONE PERSON ONLY**: This resume belongs to ONE person. Keep all data together.
3. **EXACT MAPPING**: Each job must have its own position, company, dates, and responsibilities.
4. **NO HALLUCINATION**: Only extract information that EXISTS in the PDF.
5. **CHRONOLOGICAL ORDER**: List experiences and education from most recent to oldest.

### EXTRACTION GUIDELINES:

**Personal Information:**
- firstName, lastName: Split full name
- phone, email: Extract contact details
- linkedin: Extract LinkedIn URL (clean format)
- address: City, Country or full address
- nationality: If mentioned
- aboutMe: Create 2-3 sentence summary from objective/summary section

**Education (reverse chronological):**
- For EACH degree:
  * startYear: "2018" (year only)
  * endYear: "2022" or "Present"
  * degree: Full degree name
  * institution: University/College name
  * location: City, Country
- Generate IDs: "edu-1", "edu-2", etc.

**Work Experience (reverse chronological):**
- For EACH job position:
  * position: Job title
  * company: Company name
  * startDate: "MM/YYYY" format (e.g., "06/2020")
  * endDate: "MM/YYYY" or "Present"
  * location: City, Country
  * responsibilities: Array of strings (each bullet point as separate string)
  * currentJob: true if endDate is "Present", false otherwise
- ⚠️ IMPORTANT: Keep each job separate! Don't merge responsibilities from different positions.
- Generate IDs: "exp-1", "exp-2", etc.

**Languages:**
- motherTongue: Native language
- languages: Array of other languages with proficiency
  * Use CEFR levels: A1, A2, B1, B2, C1, C2
  * If not specified, use "B2" as default
- Generate IDs: "lang-1", "lang-2", etc.

**Skills:**
- technical: ["Python", "React", "Docker"] - programming, tools, software
- soft: ["Leadership", "Communication"] - interpersonal skills

**Hobbies:**
- Comma-separated string: "Reading, Photography, Hiking"

### JSON OUTPUT FORMAT:
{
  "personalInfo": {
    "firstName": "",
    "lastName": "",
    "nationality": "",
    "phone": "",
    "email": "",
    "linkedin": "",
    "address": "",
    "aboutMe": "",
    "profilePhoto": ""
  },
  "education": [
    {
      "id": "edu-1",
      "startYear": "",
      "endYear": "",
      "location": "",
      "degree": "",
      "institution": ""
    }
  ],
  "experience": [
    {
      "id": "exp-1",
      "startDate": "MM/YYYY",
      "endDate": "MM/YYYY or Present",
      "location": "",
      "position": "",
      "company": "",
      "responsibilities": [],
      "currentJob": false
    }
  ],
  "motherTongue": "",
  "languages": [
    {
      "id": "lang-1",
      "language": "",
      "reading": "B2",
      "speaking": "B2",
      "writing": "B2"
    }
  ],
  "skills": {
    "technical": [],
    "soft": []
  },
  "hobbies": ""
}

Return ONLY the JSON object (no markdown, no explanations).
`;

  try {
    // Convert PDF buffer to base64
    const base64PDF = pdfBuffer.toString("base64");

    // Send PDF directly to Gemini
    const result = await genAI.models.generateContent({
      model: geminiConfig.model,
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: "application/pdf",
                data: base64PDF,
              },
            },
          ],
        },
      ],
      generationConfig: {
        ...geminiConfig.generationConfig,
        temperature: 0.1, // Low temperature for consistent extraction
        maxOutputTokens: 4000,
      },
    });

    // Extract response
    let extractedText;
    if (result.candidates && result.candidates[0]) {
      extractedText = result.candidates[0].content.parts[0].text;
    } else {
      console.log("Unexpected Gemini response structure");
      throw new Error("Unable to extract text from Gemini response");
    }

    // Parse JSON response
    let resumeData = parseGeminiResponse(extractedText);
    resumeData = validateResumeData(resumeData);

    return resumeData;
  } catch (error) {
    console.log("Error in extracting resume from PDF:", error.message);
    throw new Error("Failed to extract data from resume PDF: " + error.message);
  }
};

// Helper function to parse Gemini's JSON response
const parseGeminiResponse = (text) => {
  try {
    let jsonText = text.trim();

    // Remove markdown code blocks if any
    jsonText = jsonText.replace(/```json\s*/g, "").replace(/```\s*$/g, "");

    // Extract JSON object
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }

    return JSON.parse(jsonText);
  } catch (error) {
    console.log("Error parsing Gemini response:", error.message);
    throw new Error("Failed to parse AI response: " + error.message);
  }
};

// Validate and normalize resume data
const validateResumeData = (data) => {
  return {
    personalInfo: {
      firstName: data.personalInfo?.firstName || "",
      lastName: data.personalInfo?.lastName || "",
      nationality: data.personalInfo?.nationality || "",
      phone: data.personalInfo?.phone || "",
      email: data.personalInfo?.email || "",
      linkedin: data.personalInfo?.linkedin || "",
      address: data.personalInfo?.address || "",
      aboutMe: data.personalInfo?.aboutMe || "",
      profilePhoto: data.personalInfo?.profilePhoto || "",
    },
    education: Array.isArray(data.education)
      ? data.education.map((edu, index) => ({
          id: edu.id || `edu-${index + 1}`,
          startYear: edu.startYear || "",
          endYear: edu.endYear || "",
          location: edu.location || "",
          degree: edu.degree || "",
          institution: edu.institution || "",
        }))
      : [],
    experience: Array.isArray(data.experience)
      ? data.experience.map((exp, index) => ({
          id: exp.id || `exp-${index + 1}`,
          startDate: exp.startDate || "",
          endDate: exp.endDate || "",
          location: exp.location || "",
          position: exp.position || "",
          company: exp.company || "",
          responsibilities: Array.isArray(exp.responsibilities)
            ? exp.responsibilities
            : [],
          currentJob: exp.currentJob || false,
        }))
      : [],
    motherTongue: data.motherTongue || "",
    languages: Array.isArray(data.languages)
      ? data.languages.map((lang, index) => ({
          id: lang.id || `lang-${index + 1}`,
          language: lang.language || "",
          reading: lang.reading || "B2",
          speaking: lang.speaking || "B2",
          writing: lang.writing || "B2",
        }))
      : [],
    skills: {
      technical: Array.isArray(data.skills?.technical)
        ? data.skills.technical
        : [],
      soft: Array.isArray(data.skills?.soft) ? data.skills.soft : [],
    },
    hobbies: data.hobbies || "",
  };
};

module.exports = { extractResumeFromPDF };
