const express = require('express');
const router = express.Router();
const courseController = require('../controllers/courseOnlyController');
const validateMiddleware = require('../utils/validate');
const courseValidation = require('../validations/CourseValidation');

// CRUD routes
router.post('/',validateMiddleware(courseValidation), courseController.createCourse);
router.get('/', courseController.getAllCourses);
router.get('/:courseId', courseController.getCourseById);
router.put('/:courseId',validateMiddleware(courseValidation), courseController.updateCourse);
router.delete('/:courseId', courseController.deleteCourse);
router.get('/fullCourse/:courseId',courseController.geFullCourseById);

module.exports = router;
