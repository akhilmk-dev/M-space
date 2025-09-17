const express = require('express');
const { createStudent, updateStudent, listStudents, deleteStudent, getStudentsByCourseId } = require('../controllers/studentController');
const { authenticate } = require('../middleware/authMiddleware');
const router = express.Router();

// Create a new student
router.post('/', createStudent );

// Update student
router.put('/:id', updateStudent);

// Get list of students with pagination and optional search
router.get('/', listStudents );

// Delete student
router.delete('/:id', deleteStudent);

router.get('/by-course/:courseId',authenticate, getStudentsByCourseId);

module.exports = router;