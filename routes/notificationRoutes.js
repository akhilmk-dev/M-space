const express = require("express");
const { getUserNotifications, getStudentNotifications, getTutorNotifications } = require("../controllers/notificationController");
const { authenticate } = require("../middleware/authMiddleware");
const router = express.Router();

router.get("/student",authenticate,getStudentNotifications);
router.get("/tutor",authenticate,getTutorNotifications);


module.exports = router;