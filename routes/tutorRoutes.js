const express = require("express");
const router = express.Router();
const tutorController = require("../controllers/tutorController");
const { authenticate } = require("../middleware/authMiddleware");
const validateMiddleware = require("../utils/validate");
const { addTutorSchema, updateTutorSchema } = require("../validations/tutorValidation");

// Create tutor
router.post("/",authenticate,validateMiddleware(addTutorSchema), tutorController.createTutor);

// List tutors with pagination & search
router.get("/",authenticate, tutorController.listTutors);

// Update tutor
router.put("/:tutorId",authenticate,validateMiddleware(updateTutorSchema), tutorController.updateTutor);

// Delete tutor
router.delete("/:tutorId",authenticate, tutorController.deleteTutor);

// Get tutors by courseId
router.get("/course/:courseId",authenticate, tutorController.getTutorsByCourseId);

// change password for tutor
router.post('/change-password',authenticate,tutorController.changeTutorPassword);

// tutor profile update
router.post('/profile',authenticate,validateMiddleware(updateTutorSchema),tutorController.updateTutorProfile);

// tutor home page api
router.get('/home',authenticate,tutorController.tutorHome)

// check email
router.post('/check-email',tutorController.checkEmail);

// verify otp
router.post('/verify-otp',tutorController.verifyOtp)

// reset password
router.post('/reset-password',tutorController.resetPassword);

// tutor profile for admin
router.get('/tutor-profile/:tutorId',authenticate,tutorController.getTutorProfileForAdmin);

module.exports = router;
