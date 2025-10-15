const express = require('express');
const router = express.Router();
const courseController = require('../controllers/courseOnlyController');
const validateMiddleware = require('../utils/validate');
const courseValidation = require('../validations/CourseValidation');
const { authenticate } = require('../middleware/authMiddleware');

// CRUD routes
router.post('/',authenticate,validateMiddleware(courseValidation), courseController.createCourse);
router.get('/',authenticate, courseController.getAllCourses);
router.get('/admin/dropdown',authenticate,courseController.getActiveCourses)
router.get('/:courseId',authenticate, courseController.getCourseById);
router.put('/:courseId',authenticate,validateMiddleware(courseValidation), courseController.updateCourse);
router.delete('/:courseId',authenticate, courseController.deleteCourse);
router.get('/fullCourse/:courseId',authenticate,courseController.geFullCourseById);
router.get('/tutor/:tutorId',authenticate,courseController.getCoursesByAssignedTutor);

module.exports = router;
