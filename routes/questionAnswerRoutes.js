const express = require('express');
const {
  askQuestion,
  answerQuestion,
  getLessonQuestions,
  getStudentQuestionsByLesson,
  getAllQuestions
} = require('../controllers/questionAnswerController');
const { authenticate } = require('../middleware/authMiddleware');
const { askQuestionSchema, answerQuestionSchema } = require('../validations/questionAnswerValidation');
const validateMiddleware = require('../utils/validate');
const router = express.Router();


// get all questions for admin
router.get('/',authenticate,getAllQuestions);

// Student asks a question
router.post('/', authenticate,validateMiddleware(askQuestionSchema), askQuestion);

// Tutor answers a question
router.put('/answer/:id', authenticate, validateMiddleware(answerQuestionSchema),answerQuestion);

// Student gets their own Q&A for a lesson
router.get('/student/lesson/:lessonId', authenticate, getStudentQuestionsByLesson);

// Tutor gets all questions for a lesson
router.get('/lesson/:lessonId', authenticate, getLessonQuestions);

module.exports = router;
