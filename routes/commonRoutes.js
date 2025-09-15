const express = require('express');
const router = express.Router();
const validateMiddleware = require('../utils/validate');
const { authenticate } = require('../middleware/authMiddleware');
const { getImageUrl, markLessonCompletion } = require('../controllers/commonController');
const validateLessonCompletion = require('../validations/lessonCompletionValidation');

router.post('/pre-signed-url',authenticate, getImageUrl);
router.post('/lesson-completion',authenticate,validateMiddleware(validateLessonCompletion),markLessonCompletion);

module.exports = router;
