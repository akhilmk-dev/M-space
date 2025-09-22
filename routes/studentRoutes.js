const express = require('express');
const { createStudent, updateStudent, listStudents, deleteStudent, getStudentsByCourseId } = require('../controllers/studentController');
const { authenticate } = require('../middleware/authMiddleware');
const router = express.Router();

// Create a new student
router.post('/', createStudent );

// Update student
router.put('/:studentId', updateStudent);

// Get list of students with pagination and optional search
router.get('/', listStudents );

// Delete student
router.delete('/:studentId', deleteStudent);

router.get('/by-course/:courseId',authenticate, getStudentsByCourseId);

module.exports = router;