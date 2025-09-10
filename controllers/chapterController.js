const Chapter = require('../models/Chapter');
const Module = require('../models/Module');
const catchAsync = require('../utils/catchAsync');

const {
  NotFoundError,
  ConflictError,
  BadRequestError,
  EmptyRequestBodyError,
} = require('../utils/customErrors');

// Create Chapter
exports.createChapter = catchAsync(async (req, res) => {
  const { moduleId, title, orderIndex } = req.body;
  // Check if module exists
  const moduleExists = await Module.findById(moduleId);
  if (!moduleExists) {
    throw new NotFoundError("Module not found");
  }

  // Check for existing chapter with same title in the module
  const existingChapter = await Chapter.findOne({ moduleId, title });
  if (existingChapter) {
    throw new ConflictError("A chapter with this title already exists in this module.");
  }

  const chapter = await Chapter.create({ moduleId, title, orderIndex });
  res.status(201).json({ status: 'success', data: chapter });
});


// Get All Chapters
exports.getAllChapters = catchAsync(async (req, res) => {
  const chapters = await Chapter.find().populate('moduleId', 'title');
  res.status(200).json({ status: 'success', data: chapters });
});

// Get Chapter by ID
exports.getChapterById = catchAsync(async (req, res) => {
  const { chapterId } = req.params;
  const chapter = await Chapter.findById(chapterId).populate('moduleId', 'title');

  if (!chapter) throw new NotFoundError('Chapter not found');

  res.status(200).json({ status: 'success', data: chapter });
});

// Update Chapter
exports.updateChapter = catchAsync(async (req, res) => {
  const { chapterId } = req.params;
  const updates = req.body;

  if (!Object.keys(updates).length) {
    throw new EmptyRequestBodyError();
  }

  const chapter = await Chapter.findById(chapterId);
  if (!chapter) throw new NotFoundError('Chapter not found');

  // If moduleId is being updated, check if the new module exists
  if (updates.moduleId) {
    const moduleExists = await Module.findById(updates.moduleId);
    if (!moduleExists) throw new NotFoundError('Module not found');
  }

  // Check for title conflict within the same module (if title or moduleId is changing)
  if (updates.title || updates.moduleId) {
    const targetModuleId = updates.moduleId || chapter.moduleId;

    const titleConflict = await Chapter.findOne({
      _id: { $ne: chapterId },
      moduleId: targetModuleId,
      title: updates.title || chapter.title,
    });

    if (titleConflict) {
      throw new ConflictError('Another chapter with this title already exists in this module');
    }
  }

  Object.assign(chapter, updates);
  await chapter.save();

  res.status(200).json({ status: 'success', message: "Chapter updated successfully", data: chapter });
});

// Delete Chapter
exports.deleteChapter = catchAsync(async (req, res) => {
  const { chapterId } = req.params;
  const chapter = await Chapter.findByIdAndDelete(chapterId);

  if (!chapter) throw new NotFoundError('Chapter not found');

  res.status(200).json({ status: 'success', message: 'Chapter deleted successfully' });
});

// Get Chapters by Module ID
exports.getChaptersByModuleId = catchAsync(async (req, res) => {
  const { moduleId } = req.params;

  if (!moduleId) {
    throw new BadRequestError('Module ID is required');
  }

  const module = await Module.findById(moduleId);
  if (!module) {
    throw new NotFoundError('Module not found');
  }

  const chapters = await Chapter.find({ moduleId })
    .sort({ orderIndex: 1 })
    .populate('moduleId', 'title');

  res.status(200).json({
    status: 'success',
    data: chapters,
  });
});

