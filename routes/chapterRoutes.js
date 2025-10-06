const express = require('express');
const router = express.Router();
const chapterController = require('../controllers/chapterController');
const validateMiddleware = require('../utils/validate');
const createChapterSchema = require('../validations/chapterValidation');
const { authenticate } = require('../middleware/authMiddleware');

// Create Chapter
router.post('/',authenticate, validateMiddleware(createChapterSchema), chapterController.createChapter);

// Get All Chapters
router.get('/',authenticate, chapterController.getAllChapters);

// Get Chapter by ID
router.get('/:chapterId',authenticate, chapterController.getChapterById);

// Update Chapter
router.put('/:chapterId',authenticate,validateMiddleware(createChapterSchema), chapterController.updateChapter);

// Delete Chapter
router.delete('/:chapterId',authenticate, chapterController.deleteChapter);

// chapter by module
router.get('/by-module/:moduleId',authenticate,chapterController.getChaptersByModuleId);

router.get('/student/by-module/:moduleId',authenticate,chapterController.getChaptersByModuleIdForStudent)

module.exports = router;
