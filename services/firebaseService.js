const admin = require("firebase-admin");

const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

if (serviceAccountBase64) {
  const serviceAccount = JSON.parse(
    Buffer.from(serviceAccountBase64, "base64").toString("utf8")
  );

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log("Firebase Admin initialized");
} else {
  console.warn(
    "FIREBASE_SERVICE_ACCOUNT_BASE64 not set - push notifications disabled"
  );
}

const sendPushNotification = async (fcmToken, title, body, data = {}) => {
  if (!serviceAccountBase64) return null;

  try {
    const message = {
      token: fcmToken,
      notification: { title, body },
      data: data,
    };
    const response = await admin.messaging().send(message);
    return response;
  } catch (error) {
    console.error("Error sending push:", error);
    throw error;
  }
};

module.exports = { sendPushNotification };
