const express = require('express');
const { createLessons, deleteLesson, getLessonById, updateSingleLesson } = require('../controllers/lessonController');
const validateMiddleware = require('../utils/validate');
const { lessonValidationSchema } = require('../validations/lessonValidation');
const { updateLessonBodySchema } = require('../validations/updateLesson');
const router = express.Router();

router.post('/',validateMiddleware(lessonValidationSchema),createLessons);
router.put('/:lessonId',validateMiddleware(updateLessonBodySchema),updateSingleLesson);
router.delete('/:lessonId', deleteLesson);
router.get('/:lessonId', getLessonById);

module.exports = router;
