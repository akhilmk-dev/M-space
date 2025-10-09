const express = require('express');
const { createStudent, updateStudent, listStudents, deleteStudent, getStudentsByCourseId, listStudentsByTutor, getStudentDetailsWithSubmissions, changeStudentPassword, updateStudentProfile } = require('../controllers/studentController');
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

// list students for tutor
router.get('/by-tutor/:tutorId',authenticate,listStudentsByTutor);

// student details with submissions
router.get('/student-details/:studentId',authenticate,getStudentDetailsWithSubmissions);

// change password for student
router.post('/change-password',authenticate,changeStudentPassword);

// profile update by student
router.post('/profile',authenticate,validateMiddleware(updateStudentSchema),updateStudentProfile);

module.exports = router;