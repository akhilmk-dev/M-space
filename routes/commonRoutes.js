const express = require('express');
const router = express.Router();
const validateMiddleware = require('../utils/validate');
const { authenticate } = require('../middleware/authMiddleware');
const { getImageUrl, markLessonCompletion, updateLessonCurrentTime, getDashboardStats } = require('../controllers/commonController');
const {validateLessonCompletion,  lessonCurrentTime} = require('../validations/lessonCompletionValidation');

router.post('/pre-signed-url',authenticate, getImageUrl);
router.post('/lesson-completion',authenticate,validateMiddleware(validateLessonCompletion),markLessonCompletion);
router.post('/lesson-currentTime',authenticate,validateMiddleware(lessonCurrentTime),updateLessonCurrentTime);
router.get('/dashboard',authenticate,getDashboardStats);

module.exports = router;
