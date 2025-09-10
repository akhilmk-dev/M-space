const express = require('express');
const router = express.Router();
const chapterController = require('../controllers/chapterController');
const validateMiddleware = require('../utils/validate');
const createChapterSchema = require('../validations/chapterValidation');

// Create Chapter
router.post('/', validateMiddleware(createChapterSchema), chapterController.createChapter);

// Get All Chapters
router.get('/', chapterController.getAllChapters);

// Get Chapter by ID
router.get('/:chapterId', chapterController.getChapterById);

// Update Chapter
router.put('/:chapterId',validateMiddleware(createChapterSchema), chapterController.updateChapter);

// Delete Chapter
router.delete('/:chapterId', chapterController.deleteChapter);

module.exports = router;
