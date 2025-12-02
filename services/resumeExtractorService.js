const { getGeminiClient, geminiConfig } = require("../config/gemini");

const extractResumeData = async (resumeText) => {
  const genAI = getGeminiClient();
  if (!genAI) {
    throw new Error("Gemini not initialized");
  }

  const prompt = `
You are a resume parsing expert specializing in reconstructing broken text layouts.
The text provided comes from a PDF parser that often reads columns linearly, causing dates and locations to become separated from their job titles (e.g., all titles listed first, then all dates listed later).

### CRITICAL PROCESSING INSTRUCTIONS:
1. **Layout Repair (Internal Step):** Before extracting JSON, analyze the text stream. If you see a cluster of Job Titles followed later by a cluster of Dates, map them sequentially. (e.g., The 1st date in the cluster likely belongs to the 1st title in the previous cluster).
2. **Company Grouping:** Identify if multiple roles belong to the same company. If a company name (like "Simplilearn") is listed once, but followed by multiple roles, apply that company to all relevant roles.
3. **Implicit Current Jobs:** If a date range includes "Present" or "Current", set "currentJob": true.

### DATA EXTRACTION RULES:
1. **Personal Info:** Extract Name, Phone, Email, Address, LinkedIn/Links.
2. **Education:** Extract Degree, Institution, Year (Start/End), Location.
3. **Experience:** Extract Role, Company, Start Date (MM/YYYY), End Date (MM/YYYY), Location, Responsibilities.
   - *Correction Rule:* If "Nelson Sports" appears between Simplilearn titles and Simplilearn dates in the text stream, ignore the text order and use logical date proximity to assign the correct company.
4. **Skills:** separate into Technical vs Soft.
5. **Languages:** Standardize to CEFR (A1-C2) if possible, otherwise use descriptive levels.

### JSON OUTPUT FORMAT (Strictly adhere to this):
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
      "responsibilities": [ "List strings", "do not put bullet points here" ],
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

### RESUME CONTENT:
${resumeText}

Response (JSON ONLY):
`;

  try {
    const result = await genAI.models.generateContent({
      model: geminiConfig.model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: geminiConfig.generationConfig,
    });

    let extractedText;
    if (result.candidates && result.candidates[0]) {
      extractedText = result.candidates[0].content.parts[0].text;
    } else {
      console.log("Unexpected Gemini response structure");
      throw new Error("Unable to extract text from Gemini response");
    }

    let resumeData = parseGeminiResponse(extractedText);
    resumeData = validateResumeData(resumeData);

    return resumeData;
  } catch (error) {
    console.log("Error in extracting resume data:", error.message);
    throw new Error("Failed to extract data from resume: " + error.message);
  }
};

const parseGeminiResponse = (text) => {
  try {
    let jsonText = text.trim();

    //removes markdown blocks if any
    jsonText = jsonText.replace(/```json\s*/g, "").replace(/```\s*$/g, "");

    //matches the JSON object in response
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }
    return JSON.parse(jsonText);
  } catch (error) {
    console.log("Error in parsing gemini response: ", error.message);
    throw new Error("Failed to parse response: ", error.message);
  }
};

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

module.exports = { extractResumeData };
