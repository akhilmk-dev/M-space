const express = require('express');
const {
  askQuestion,
  answerQuestion,
  getLessonQuestions,
  getStudentQuestionsByLesson
} = require('../controllers/questionAnswerController');
const { authenticate } = require('../middleware/authMiddleware');


const router = express.Router();

// Student asks a question
router.post('/', authenticate, askQuestion);

// Tutor answers a question
router.put('/answer/:id', authenticate, answerQuestion);

// Student gets their own Q&A for a lesson
router.get('/student/lesson/:lessonId', authenticate, getStudentQuestionsByLesson);

// Tutor gets all questions for a lesson
router.get('/lesson/:lessonId', authenticate, getLessonQuestions);

module.exports = router;
