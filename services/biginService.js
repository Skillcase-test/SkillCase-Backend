const axios = require("axios");
const fs = require("fs");
const zohoConfig = require("../config/zohoConfig");

// Read access token from file
function readToken() {
  try {
    if (fs.existsSync(zohoConfig.tokenFilePath)) {
      return fs.readFileSync(zohoConfig.tokenFilePath, "utf8").trim();
    }
  } catch (error) {
    console.error("Error reading token file:", error.message);
  }
  return null;
}

// Save access token to file
function saveToken(token) {
  try {
    fs.writeFileSync(zohoConfig.tokenFilePath, token, "utf8");
  } catch (error) {
    console.error("Error saving token:", error.message);
  }
}

// Refresh access token using refresh token
async function refreshToken() {
  try {
    const params = new URLSearchParams({
      refresh_token: zohoConfig.refreshToken,
      client_id: zohoConfig.clientId,
      client_secret: zohoConfig.clientSecret,
      grant_type: "refresh_token",
    });

    const response = await axios.post(
      zohoConfig.accountsUrl,
      params.toString(),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    if (response.data.access_token) {
      saveToken(response.data.access_token);
      console.log("Zoho token refreshed successfully");
      return response.data.access_token;
    }

    throw new Error("No access token in response");
  } catch (error) {
    console.error("Error refreshing Zoho token:", error.message);
    throw error;
  }
}

// Make authenticated API request to Bigin
async function biginRequest(method, endpoint, data = null, retry = true) {
  let token = readToken();

  if (!token) {
    token = await refreshToken();
  }

  try {
    const config = {
      method,
      url: `${zohoConfig.apiBaseUrl}${endpoint}`,
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        "Content-Type": "application/json",
      },
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);

    return response.data;
  } catch (error) {
    if (error.response?.status === 401 && retry) {
      console.log("Token expired, refreshing...");
      await refreshToken();
      return biginRequest(method, endpoint, data, false);
    }

    throw error;
  }
}

// Search contact by phone number
async function searchContactByPhone(phone) {
  try {
    const normalizedPhone = phone.replace(/\D/g, "").slice(-10);

    const response = await biginRequest(
      "GET",
      `/Contacts/search?phone=${encodeURIComponent(normalizedPhone)}`
    );

    if (response.data && response.data.length > 0) {
      console.log("Found", response.data.length, "contact(s) in Bigin");
      return { exists: true, contact: response.data[0] };
    }

    console.log("No existing contact found");
    return { exists: false };
  } catch (error) {
    if (error.response?.status === 204) {
      console.log("No existing contact found (204)");
      return { exists: false };
    }
    console.error("Bigin search error:", error.message);
    return { exists: false, error: error.message };
  }
}

// Create new contact in Bigin
async function createContact(userData) {
  const { fullname, phone, email, language_level, qualification, experience } =
    userData;

  const normalizedPhone = phone.replace(/\D/g, "").slice(-10);

  const contactData = {
    data: [
      {
        Last_Name: fullname || "User",
        First_Name: "",
        Account_Name: "Skillcase",
        Mobile: normalizedPhone,
        Email: email || "",
        Language_Level: language_level || "",
        Educational_Qualification: qualification || "",
        Work_Experience: experience || "",
        Tag: [{ name: "App install" }],
        Description: "Registered via Learner App",
      },
    ],
  };

  console.log("Sending to Bigin:", {
    name: fullname,
    phone: normalizedPhone,
    email,
    language_level,
    tag: "App install",
  });

  try {
    const response = await biginRequest("POST", "/Contacts", contactData);

    if (response.data && response.data[0]) {
      console.log(
        "Bigin response:",
        response.data[0].code,
        response.data[0].status
      );
      return {
        success: true,
        zohoId: response.data[0].details.id,
      };
    }

    console.error("Unexpected Bigin response:", response);
    return { success: false, error: "No ID returned" };
  } catch (error) {
    console.error("Bigin create contact error:", error.message);
    if (error.response?.data) {
      console.error("Error details:", JSON.stringify(error.response.data));
    }
    return { success: false, error: error.message };
  }
}

// Insert or get existing contact
async function insertOrGetContact(userData) {
  const { phone, fullname } = userData;

  console.log("Bigin: Searching for contact...");
  console.log("Phone:", phone);

  const searchResult = await searchContactByPhone(phone);

  if (searchResult.exists) {
    console.log("Contact already exists in Bigin");
    console.log("Existing Zoho ID:", searchResult.contact.id);
    return {
      status: "exists",
      zohoId: searchResult.contact.id,
    };
  }

  console.log("Creating new contact in Bigin...");
  console.log("Name:", fullname);

  const createResult = await createContact(userData);

  if (createResult.success) {
    console.log("Contact created successfully");
    console.log("New Zoho ID:", createResult.zohoId);
    return {
      status: "created",
      zohoId: createResult.zohoId,
    };
  }

  console.error("Failed to create contact:", createResult.error);
  return {
    status: "error",
    error: createResult.error,
  };
}

module.exports = {
  searchContactByPhone,
  createContact,
  insertOrGetContact,
  refreshToken,
};
