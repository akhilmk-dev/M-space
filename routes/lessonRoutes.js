const express = require('express');
const { createLessons, deleteLesson, getLessonById, updateSingleLesson, getLessonsByCourseId } = require('../controllers/lessonController');
const validateMiddleware = require('../utils/validate');
const { lessonValidationSchema } = require('../validations/lessonValidation');
const { updateLessonBodySchema } = require('../validations/updateLesson');
const { authenticate } = require('../middleware/authMiddleware');
const router = express.Router();

router.post('/',authenticate,validateMiddleware(lessonValidationSchema),createLessons);
router.put('/:lessonId',authenticate,validateMiddleware(updateLessonBodySchema),updateSingleLesson);
router.delete('/:lessonId',authenticate, deleteLesson);
router.get('/:lessonId',authenticate, getLessonById);
router.get('/by-course/:courseId',authenticate,getLessonsByCourseId);

module.exports = router;
