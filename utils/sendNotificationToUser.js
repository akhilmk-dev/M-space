const Notification = require("../models/Notification");
const axios = require("axios");

async function sendNotificationToUser(userId, title, message, url = "", extraData = {}) {
  try {
    // Send to OneSignal
    const response = await axios.post(
      "https://onesignal.com/api/v1/notifications",
      {
        app_id: "e14346cb-7988-4afd-baad-429c530622a1", // OneSignal App ID
        include_external_user_ids: [userId], // MongoDB userId
        headings: { en: title },
        contents: { en: message },
        // For mobile apps, you can include additional data
        data: extraData,
        android_background_layout: {}, // optional, for Android notification styling
        ios_badgeType: "Increase",
        ios_badgeCount: 1,
        web_url: url || "", // optional
      },
      {
        headers: {
          Authorization: "Basic YzE4NWExMGYtMWUzZC00MGRhLTgzODgtZjU4MTg2Y2Q4ZGIz", // REST API key
          "Content-Type": "application/json",
        },
      }
    );

    // Store in DB
    await Notification.create({
      userId,
      title,
      message,
      extraData,
      sentVia: "onesignal",
      webUrl: url,
    });

    return response.data;
  } catch (error) {
    console.error("Error sending notification:", error.response?.data || error.message);
  }
}
