const checkDependencies = require('../helper/checkDependencies');
const hasPermission = require('../helper/hasPermission');
const Chapter = require('../models/Chapter');
const Lesson = require('../models/Lesson');
const LessonCompletion = require('../models/LessonCompletion');
const Module = require('../models/Module');
const Student = require('../models/Student');
const catchAsync = require('../utils/catchAsync');

const {
  NotFoundError,
  ConflictError,
  BadRequestError,
  EmptyRequestBodyError,
  InternalServerError,
  ForbiddenError,
} = require('../utils/customErrors');

// Create Chapter
exports.createChapter = catchAsync(async (req, res) => {
  const { moduleId, title, orderIndex } = req.body;
  const isPermission = await hasPermission(req.user?.id, "Add Chapter");
  if (!isPermission ) {
    throw new ForbiddenError("User Doesn't have permission to create chapter")
  }
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

  // Check for existing chapter with same orderIndex in the module
  const existingOrder = await Chapter.findOne({ moduleId, orderIndex });
  if (existingOrder) {
    throw new ConflictError(`A chapter with order ${orderIndex} already exists in this module.`);
  }

  // Create chapter
  const chapter = await Chapter.create({ moduleId, title, orderIndex });
  res.status(201).json({ status: "success", data: {
    _id:chapter?._id,
    moduleId:moduleExists ? moduleExists: chapter?.moduleId,
    title:chapter?.title,
    orderIndex:chapter?.orderIndex,
    createdAt:chapter?.createdAt
  } });
});

// Get All Chapters
exports.getAllChapters = catchAsync(async (req, res) => {
  //  Pagination
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  //  Search
  const search = req.query.search || '';
  const searchRegex = new RegExp(search, 'i');

  // Sort parsing from `sortBy=field:direction`
  let sortField = 'createdAt';
  let sortOrder = -1; 

  if (req.query.sortBy) {
    const [field, order] = req.query.sortBy.split(':');
    sortField = field || 'createdAt';
    sortOrder = order === 'asc' ? 1 : -1;
  }

  //  Module filter (if moduleId provided in query)
  const moduleId = req.query.moduleId;

  // Query conditions
  const query = {
    ...(moduleId ? { moduleId } : {}), 
    title: { $regex: searchRegex }      
  };

  // Count
  const totalChapters = await Chapter.countDocuments(query);

  // Fetch
  const chapters = await Chapter.find(query)
    .populate('moduleId', 'title _id courseId')   
    .sort({ [sortField]: sortOrder })
    .skip(skip)
    .limit(limit);

  // Response
  res.status(200).json({
    status: 'success',
    page,
    limit,
    total: totalChapters,
    totalPages: Math.ceil(totalChapters / limit),
    data: chapters,
  });
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

  const chapter = await Chapter.findById(chapterId).populate('moduleId');
  
  if (!chapter) throw new NotFoundError('Chapter not found');

  // If moduleId is being updated, check if the new module exists
  let module= null
  if (updates.moduleId) {
    const moduleExists = await Module.findById(updates.moduleId);
     module = moduleExists;
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

  res.status(200).json({ status: 'success', message: "Chapter updated successfully", data: {
    _id:chapter?._id,
    moduleId:module ? module: chapter?.moduleId,
    title:chapter?.title,
    orderIndex:chapter?.orderIndex,
    createdAt:chapter?.createdAt
  } });
});

// Delete Chapter
exports.deleteChapter = catchAsync(async (req, res) => {
  const { chapterId } = req.params;

  // Check if chapter exists
  const chapter = await Chapter.findById(chapterId);
  if (!chapter) throw new NotFoundError("Chapter not found");

  // Prevent deletion if dependencies exist
  await checkDependencies("Chapter", chapterId, ["chapterId"]);

  // Delete chapter
  const deletedChapter = await Chapter.findByIdAndDelete(chapterId);

  res.status(200).json({
    status: "success",
    message: "Chapter deleted successfully",
    data: deletedChapter,
  });
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

exports.getChaptersByModuleIdForStudent = catchAsync(async (req, res) => {
  const { moduleId } = req.params;
  const { page = 1, limit = 10 } = req.query;
  const studentId = req.user.id;

  if (!moduleId) throw new BadRequestError("Module ID is required");
  if (!studentId) throw new BadRequestError("Student ID is required");

  const skip = (parseInt(page) -1 ) * parseInt(limit);

  // Ensure module exists
  const module = await Module.findById(moduleId);
  if (!module) throw new InternalServerError("Module not found");

  // Ensure student is enrolled
  const student = await Student.findOne({ userId: studentId, courseId:module.courseId})
    .populate("userId", "status name email");
  if (!student) throw new InternalServerError("Student not found or not enrolled in this course");
  if (student.userId?.status === false) throw new InternalServerError("Student account is inactive");

  // Fetch paginated chapters
  const chapters = await Chapter.find({ moduleId })
    .sort({ orderIndex: 1 })
    .skip(skip)
    .limit(parseInt(limit))
    .lean(); 

  const totalChapters = await Chapter.countDocuments({ moduleId });

  // Get all lesson IDs for these chapters
  const chapterIds = chapters.map(c => c._id);
  const lessons = await Lesson.find({ chapterId: { $in: chapterIds } }).select('_id chapterId').lean();

  // Map lessons to chapters
  const chapterLessonMap = {};
  lessons.forEach(l => {
    const chapId = l.chapterId.toString();
    if (!chapterLessonMap[chapId]) chapterLessonMap[chapId] = [];
    chapterLessonMap[chapId].push(l._id.toString());
  });

  // Get all completed lessons by student
  const completedLessons = await LessonCompletion.find({
    studentId,
    lessonId: { $in: lessons.map(l => l._id) },
    isCompleted: true
  }).select('lessonId').lean();

 const completedLessonIds = new Set(completedLessons.map(lc => lc.lessonId.toString()));

  // Build final chapter data with isCompleted
  const chapterData = chapters.map(chapter => {
    const lessonIds = chapterLessonMap[chapter._id.toString()] || [];
    const totalLessons = lessonIds.length;
    const completedCount = lessonIds.filter(id => completedLessonIds.has(id)).length;
    return {
      ...chapter,
      totalLessons,
      completedLessons: completedCount,
      isCompleted: totalLessons > 0 && completedCount === totalLessons
    };
  });

  res.status(200).json({
    status: "success",
    totalChapters,
    currentPage: parseInt(page),
    totalPages: Math.ceil(totalChapters / limit),
    data: chapterData,
  });
});

