const express = require('express');
const getStudentsByCourseId = require('../controllers/studentController');
const { authenticate } = require('../middleware/authMiddleware');
const router = express.Router()

router.get('/by-course/:courseId',authenticate, getStudentsByCourseId);

module.exports = router;