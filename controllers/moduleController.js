const Module = require('../models/Module');
const Course = require('../models/Course');
const catchAsync = require('../utils/catchAsync');
const {
  NotFoundError,
  ConflictError,
  BadRequestError,
  EmptyRequestBodyError,
} = require('../utils/customErrors');
const Lesson = require('../models/Lesson');
const LessonCompletion = require('../models/LessonCompletion');
const Chapter = require('../models/Chapter');

// 🔸 Create Module
exports.createModule = catchAsync(async (req, res) => {
  const { title, orderIndex, courseId } = req.body;

  const course = await Course.findById(courseId);
  if (!course) throw new NotFoundError("course does not exist");

  const duplicate = await Module.findOne({ courseId, title });
  if (duplicate) {
    throw new ConflictError("A module with the same title already exists");
  }
  const module = await Module.create({ courseId, title, orderIndex });
  res.status(201).json({
    status: 'success',
    data: module,
  });
});

// Get All Modules
exports.getAllModules = catchAsync(async (req, res) => {
  const modules = await Module.find().populate('courseId', 'title');
  res.status(200).json({ status: 'success', data: modules });
});

// Get Module by ID
exports.getModuleById = catchAsync(async (req, res) => {
  const { moduleId } = req.params;
  const module = await Module.findById(moduleId).populate('courseId', 'title');

  if (!module) throw new NotFoundError('Module not found');

  res.status(200).json({ status: 'success', data: module });
});

// Update Module
exports.updateModule = catchAsync(async (req, res) => {
  const { moduleId } = req.params;
  const updates = req.body;

  if (!Object.keys(updates).length) {
    throw new EmptyRequestBodyError();
  }

  const module = await Module.findById(moduleId);
  if (!module) throw new NotFoundError('Module not found');

  if (updates.courseId) {
    const courseExists = await Course.findById(updates.courseId);
    if (!courseExists) throw new NotFoundError('course does not exist');
  }

  if (updates.title) {
    const duplicate = await Module.findOne({
      _id: { $ne: moduleId },
      courseId: updates.courseId || module.courseId,
      title: updates.title,
    });

    if (duplicate) {
      throw new ConflictError("Another module with this title exists in the course.");
    }
  }

  Object.assign(module, updates);
  await module.save();

  res.status(200).json({ status: 'success',message:"Module updated successully", data: module });
});

// Get Modules by Course ID
// exports.getModulesByCourseId = catchAsync(async (req, res) => {
//   const { courseId } = req.params;

//   if (!courseId) {
//     throw new BadRequestError('Course ID is required');
//   }

//   const course = await Course.findById(courseId);
//   if (!course) {
//     throw new NotFoundError('Course not found');
//   }

//   const modules = await Module.find({ courseId })
//     .sort({ orderIndex: 1 }) // optional: sort by orderIndex
//     .populate('courseId', 'title');

//   res.status(200).json({
//     status: 'success',
//     data: modules,
//   });
// });

// Helper to format minutes into "X hr Y min"
const formatDuration = (minutes) => {
  if (!minutes || minutes <= 0) return "0 min";

  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hrs > 0 && mins > 0) return `${hrs} hr ${mins} min`;
  if (hrs > 0) return `${hrs} hr`;
  return `${mins} min`;
};

exports.getModulesByCourseId = catchAsync(async (req, res) => {
  const { courseId } = req.params;
  const studentId = req.user.id;

  if (!courseId) {
    throw new BadRequestError("Course ID is required");
  }

  const course = await Course.findById(courseId);
  if (!course) {
    throw new NotFoundError("Course not found");
  }

  const modules = await Module.find({ courseId })
    .sort({ orderIndex: 1 })
    .lean();

  const moduleIds = modules.map((mod) => mod._id);

  // Get all chapters under the modules
  const chapters = await Chapter.find({ moduleId: { $in: moduleIds } }).lean();
  const chapterIds = chapters.map((chapter) => chapter._id);

  // Get all lessons under these chapters
  const lessons = await Lesson.find({ chapterId: { $in: chapterIds } }).lean();
  const lessonIds = lessons.map((lesson) => lesson._id);

  // Get completed lessons for the student
  const lessonCompletions = await LessonCompletion.find({
    studentId,
    lessonId: { $in: lessonIds },
    isCompleted: true,
  }).lean();

  const completedLessonIds = new Set(
    lessonCompletions.map((lc) => lc.lessonId.toString())
  );

  // Map chapters to their lessons for quick lookup
  const chapterLessonMap = {};
  lessons.forEach((lesson) => {
    const chapId = lesson.chapterId.toString();
    if (!chapterLessonMap[chapId]) chapterLessonMap[chapId] = [];
    chapterLessonMap[chapId].push(lesson);
  });

  // Map modules to their chapters for quick lookup
  const moduleChapterMap = {};
  chapters.forEach((chapter) => {
    const modId = chapter.moduleId.toString();
    if (!moduleChapterMap[modId]) moduleChapterMap[modId] = [];
    moduleChapterMap[modId].push(chapter);
  });

  // Enrich each module
  const enrichedModules = modules.map((mod) => {
    const chaptersInModule = moduleChapterMap[mod._id.toString()] || [];

    let totalMinutes = 0;
    let totalLessons = 0;
    let completedLessons = 0;

    chaptersInModule.forEach((chapter) => {
      const lessonsInChapter = chapterLessonMap[chapter._id.toString()] || [];

      totalLessons += lessonsInChapter.length;
      lessonsInChapter.forEach((lesson) => {
        totalMinutes += lesson.duration || 0;
        if (completedLessonIds.has(lesson._id.toString())) {
          completedLessons += 1;
        }
      });
    });

    const percentCompleted =
      totalLessons > 0
        ? Math.round((completedLessons / totalLessons) * 100)
        : 0;

    return {
      ...mod,
      totalTime: formatDuration(totalMinutes), // formatted total time
      percentCompleted: `${percentCompleted}%`, // formatted percentage
    };
  });

  res.status(200).json({
    status: "success",
    data: enrichedModules,
  });
});


// 🔸 Delete Module
exports.deleteModule = catchAsync(async (req, res) => {
  const { moduleId } = req.params;
  const module = await Module.findById(moduleId);
  if (!module) throw new NotFoundError('Module not found');
  await checkDependencies("Course",moduleId, ["courseId"]);
  const deletedModule = await Module.findByIdAndDelete(moduleId);
  res.status(200).json({ status: 'success', message: 'Module deleted successfully' });
});
