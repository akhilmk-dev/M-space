const Notification = require("../models/Notification");
const axios = require("axios");
async function sendNotificationToStudent(userId, title, message, url = "", extraData = {}) {
  try {
    // Send to OneSignal
    const response = await axios.post(
      "https://onesignal.com/api/v1/notifications",
      {
        app_id: "1d2d88ec-0fce-46a3-896b-54ae35180bfe", // OneSignal App ID
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
          Authorization: `Basic os_v2_app_duwyr3apzzdkhcllksxdkgal7ytbnq4abvzefp56b3orgslhk5wea5pixe2jra7dmqm7zxshqaymsi5nz7u6g57cs6tj4pnq4bdt6ny`, // REST API key
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
async function sendNotificationToTutor(userId, title, message, url = "", extraData = {}) {
  try {
    // Send to OneSignal
    const response = await axios.post(
      "https://onesignal.com/api/v1/notifications",
      {
        app_id:process.env.ONESIGNAL_TUTOR_APP_ID, // OneSignal App ID
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
          Authorization: `Basic ${process.env.ONESIGNAL_TUTOR_APP_REST_API_KEY}`, // REST API key
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

module.exports = {
  sendNotificationToStudent,
  sendNotificationToTutor
}