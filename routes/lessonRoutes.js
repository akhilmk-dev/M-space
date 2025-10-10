const express = require('express');
const { createLessons, deleteLesson, getLessonById, updateSingleLesson, getLessonsByCourseId, getLessonsByChapterIdForTutor, getLessonsByChapterIdForStudent, getAllLessons } = require('../controllers/lessonController');
const validateMiddleware = require('../utils/validate');
const { lessonValidationSchema } = require('../validations/lessonValidation');
const { updateLessonBodySchema } = require('../validations/updateLesson');
const { authenticate } = require('../middleware/authMiddleware');
const router = express.Router();
router.get('/',authenticate,getAllLessons);
router.post('/',authenticate,validateMiddleware(lessonValidationSchema),createLessons);
router.put('/:lessonId',authenticate,validateMiddleware(updateLessonBodySchema),updateSingleLesson);
router.delete('/:lessonId',authenticate, deleteLesson);
router.get('/:lessonId',authenticate, getLessonById);
router.get('/by-course/:courseId',authenticate,getLessonsByCourseId);
router.get('/by-chapter/:chapterId',authenticate,getLessonsByChapterIdForTutor);
router.get('/student/by-chapter/:chapterId',authenticate,getLessonsByChapterIdForStudent);

module.exports = router;
