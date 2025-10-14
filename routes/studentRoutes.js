const express = require('express');
const { createStudent, updateStudent, listStudents, deleteStudent, getStudentsByCourseId, listStudentsByTutor, getStudentDetailsWithSubmissions, changeStudentPassword, updateStudentProfile, getStudentsByCourseIdForDropdown, studentHome, studentPerformance, getStudentAttendance, checkEmail, verifyOtp, resetPassword, getStudentProfileForAdmin } = require('../controllers/studentController');
const { authenticate } = require('../middleware/authMiddleware');
const { addStudentSchema, updateStudentSchema } = require('../validations/studentValidation');
const validateMiddleware = require('../utils/validate');
const router = express.Router();

// Create a new student
router.post('/',authenticate,validateMiddleware(addStudentSchema), createStudent );

// Update student
router.put('/:studentId',authenticate,validateMiddleware(updateStudentSchema), updateStudent);

// Get list of students with pagination and optional search
router.get('/',authenticate, listStudents );

// Delete student
router.delete('/:studentId',authenticate, deleteStudent);

// get students in the course
router.get('/by-course/:courseId',authenticate, getStudentsByCourseId);

// get students by course
router.get('/by-course/dropdown/:courseId',authenticate,getStudentsByCourseIdForDropdown)

// list students for tutor
router.get('/by-tutor/:tutorId',authenticate,listStudentsByTutor);

// student details with submissions
router.get('/student-details/:studentId',authenticate,getStudentDetailsWithSubmissions);

// change password for student
router.post('/change-password',authenticate,changeStudentPassword);

// profile update by student
router.post('/profile',authenticate,validateMiddleware(updateStudentSchema),updateStudentProfile);

// student home
router.get('/home',authenticate,studentHome)

//student performance 
router.get('/performance',authenticate,studentPerformance)

// my attendance
router.get('/my-attendance',authenticate,getStudentAttendance);

// check email
router.post('/check-email',checkEmail);

// verify otp
router.post('/verify-otp',verifyOtp)

// reset password
router.post('/reset-password',resetPassword);

// get student details for admin
router.get('/student-profile/:studentId',authenticate,getStudentProfileForAdmin);

module.exports = router;