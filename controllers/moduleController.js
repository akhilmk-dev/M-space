const Module = require('../models/Module');
const Course = require('../models/Course');
const catchAsync = require('../utils/catchAsync');
const {
  NotFoundError,
  ConflictError,
  BadRequestError,
  EmptyRequestBodyError,
  ForbiddenError,
  UnAuthorizedError,
} = require('../utils/customErrors');
const Lesson = require('../models/Lesson');
const LessonCompletion = require('../models/LessonCompletion');
const Chapter = require('../models/Chapter');
const User = require('../models/User');
const checkDependencies = require('../helper/checkDependencies');
const ModuleCompletion = require('../models/ModuleCompletion');
const { uploadBase64ToS3 } = require('../utils/s3Uploader');
const hasPermission = require('../helper/hasPermission');

// Create Module
exports.createModule = catchAsync(async (req, res) => {
  const { title, orderIndex, courseId, thumbnail } = req.body;
  const isPermission = await hasPermission(req.user?.id, "Add Module");
  if (!isPermission ) {
    throw new ForbiddenError("User Doesn't have permission to create module")
  }
  if (!title || !courseId) {
    throw new BadRequestError("Title and Course ID are required");
  }

  // Validate course existence
  const course = await Course.findById(courseId);
  if (!course) throw new NotFoundError("Course does not exist");

  // Check duplicate title in same course
  const duplicate = await Module.findOne({ courseId, title });
  if (duplicate) {
    throw new ConflictError("A module with the same title already exists");
  }

  // Upload thumbnail if provided
  let thumbnailUrl = null;
  if (thumbnail) {
    try {
      thumbnailUrl = await uploadBase64ToS3(thumbnail, "module-thumbnails");
    } catch (err) {
      throw new BadRequestError("Error uploading thumbnail to S3: " + err.message);
    }
  }

  // Create new module
  const module = await Module.create({
    courseId,
    title,
    orderIndex,
    thumbnail: thumbnailUrl,
  });

  //  Response
  res.status(201).json({
    status: "success",
    data: {
      _id: module._id,
      courseId: course,
      title: module.title,
      orderIndex: module.orderIndex,
      thumbnail: module.thumbnail,
    },
  });
});

// Get All Modules
exports.getAllModules = catchAsync(async (req, res) => {
  const isPermission = await hasPermission(req.user?.id, "List Module");
  if (!isPermission ) {
    throw new ForbiddenError("User Doesn't have permission to list module")
  }
  // Pagination
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  // Search
  const search = req.query.search || '';
  const searchRegex = new RegExp(search, 'i');

  // Sort parsing from `sortBy=field:direction`
  let sortField = 'createdAt';
  let sortOrder = -1; // default: descending

  if (req.query.sortBy) {
    const [field, order] = req.query.sortBy.split(':');
    sortField = field || 'createdAt';
    sortOrder = order === 'asc' ? 1 : -1;
  }

  // Course filter
  const { courseId } = req.query;

  // Build query
  const query = {
    title: { $regex: searchRegex },
    ...(courseId ? { courseId } : {}), // Add course filter if provided
  };

  // Total count
  const totalModules = await Module.countDocuments(query);

  // Fetch data
  const modules = await Module.find(query)
    .populate('courseId', 'title') // populate course title
    .sort({ [sortField]: sortOrder })
    .skip(skip)
    .limit(limit);

  // Respond
  res.status(200).json({
    status: 'success',
    page,
    limit,
    total: totalModules,
    totalPages: Math.ceil(totalModules / limit),
    data: modules,
  });
});

exports.getModuleById = catchAsync(async (req, res) => {
  const { moduleId } = req.params;
  const { page = 1, limit = 10 } = req.query; // pagination params
  const user = await User.findById(req.user.id).populate("roleId");

  // Validate page/limit
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.max(1, parseInt(limit));
  const skip = (pageNum - 1) * limitNum;

  // Find the module and its course
  const module = await Module.findById(moduleId).populate("courseId", "title");
  if (!module) throw new NotFoundError("Module not found");

  // Count total chapters for pagination metadata
  const totalChapters = await Chapter.countDocuments({ moduleId });

  // Fetch paginated chapters
  const chapters = await Chapter.find({ moduleId })
    .skip(skip)
    .limit(limitNum)
    .lean();

  let studentLessonCompletions = [];

  // If user is a student, fetch completed lessons and currentTime
  if (user?.roleId?.role_name === "Student") {
    studentLessonCompletions = await LessonCompletion.find({ studentId: user._id })
      .select("lessonId currentTime isCompleted")
      .lean();

    studentLessonCompletions = new Map(
      studentLessonCompletions.map((lc) => [
        lc.lessonId.toString(),
        { currentTime: lc.currentTime || 0, isCompleted: lc.isCompleted || false },
      ])
    );
  }

  // For each chapter, fetch lessons and add completion status + currentTime
  const chaptersWithLessons = await Promise.all(
    chapters.map(async (chapter) => {
      const lessons = await Lesson.find({ chapterId: chapter._id }).lean();

      const lessonsWithCompletion = lessons.map((lesson) => {
        const completion =
          studentLessonCompletions.get(lesson._id.toString()) || {
            currentTime: 0,
            isCompleted: false,
          };
        return {
          ...lesson,
          isCompleted: completion.isCompleted,
          currentTime: completion.currentTime,
        };
      });

      return {
        ...chapter,
        lessons: lessonsWithCompletion,
      };
    })
  );

  // Final response with pagination metadata
  res.status(200).json({
    status: "success",
    data: {
      module: module.toObject(),
      chapters: chaptersWithLessons,
      totalChapters,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(totalChapters / limitNum),
    },
  });
});

// Update Module
exports.updateModule = catchAsync(async (req, res) => {
  const { moduleId } = req.params;
  const updates = req.body;
  const isPermission = await hasPermission(req.user?.id, "Edit Module");
  if (!isPermission ) {
    throw new ForbiddenError("User Doesn't have permission to edit module")
  }
  // Find module
  const module = await Module.findById(moduleId);
  if (!module) throw new NotFoundError("Module not found");

  let course = null;

  // If courseId is provided, validate
  if (updates.courseId) {
    const courseExists = await Course.findById(updates.courseId);
    if (!courseExists) throw new NotFoundError("Course does not exist");
    course = courseExists;
  }

  // Check for duplicate title within same course
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

  // Handle thumbnail update
  if (updates.thumbnail) {
    const thumb = updates.thumbnail;

    // If thumbnail is base64 (not an S3 URL)
    if (thumb.startsWith("data:")) {
      try {
        const thumbnailUrl = await uploadBase64ToS3(thumb, "module-thumbnails");
        updates.thumbnail = thumbnailUrl;
      } catch (err) {
        throw new BadRequestError("Error uploading thumbnail to S3: " + err.message);
      }
    } else if (thumb === null || thumb.trim() === "") {
      // If explicitly null or empty string → remove it
      delete updates.thumbnail;
    } else if (thumb.startsWith("http")) {
      // If already an S3 URL → don’t change it
      delete updates.thumbnail;
    }
  }

  // Apply updates
  Object.assign(module, updates);
  await module.save();

  // Response
  res.status(200).json({
    status: "success",
    message: "Module updated successfully",
    data: {
      _id: module._id,
      title: module.title,
      orderIndex: module.orderIndex,
      courseId: {
        _id: course?._id || module.courseId,
        title: course?.title,
      },
      thumbnail: module.thumbnail,
    },
  });
});

// Get Modules by Course ID
exports.getModulesForDropdown = catchAsync(async (req, res) => {
  const { courseId } = req.params;

  if (!courseId) {
    throw new BadRequestError('Course ID is required');
  }

  const course = await Course.findById(courseId);
  if (!course) {
    throw new NotFoundError('Course not found');
  }

  const modules = await Module.find({ courseId }).select('title _id')

  res.status(200).json({
    status: 'success',
    data: modules,
  });
});

// Helper to format minutes into "X hr Y min"
const formatDuration = (minutes) => {
  if (!minutes || minutes <= 0) return "0 min";

  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hrs > 0 && mins > 0) return `${hrs} Hours ${mins} Minutes`;
  if (hrs > 0 && hrs == 1) return `${hrs} Hour`;
  if (hrs > 0) return `${hrs} Hours`
  return `${mins} Minutes`;
};

exports.getModulesByCourseId = catchAsync(async (req, res) => {
  const { courseId } = req.params;
  const { status, page = 1, limit = 10 ,search} = req.query; 
  const studentId = req.user.id;
  
  if (!courseId) {
    throw new UnAuthorizedError("Course ID is required");
  }

  const course = await Course.findById(courseId);
  if (!course) {
    throw new NotFoundError("Course not found");
  }

  // Pagination calculations
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.max(1, parseInt(limit));
  const skip = (pageNum - 1) * limitNum;
  const filter = { courseId };
  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: "i" } }
    ];
  }

  // Count total modules for pagination metadata
  const totalModules = await Module.countDocuments(filter);

  // Fetch modules with pagination
  let modules = await Module.find(filter)
    .sort({ orderIndex: 1 })
    .skip(skip)
    .limit(limitNum)
    .lean();

  const moduleIds = modules.map((mod) => mod._id);

  // Chapters & lessons
  const chapters = await Chapter.find({ moduleId: { $in: moduleIds } }).lean();
  const chapterIds = chapters.map((c) => c._id);

  const lessons = await Lesson.find({ chapterId: { $in: chapterIds } }).lean();
  const lessonIds = lessons.map((l) => l._id);

  // Completed lessons
  const lessonCompletions = await LessonCompletion.find({
    studentId,
    lessonId: { $in: lessonIds },
    isCompleted: true,
  }).lean();

  const completedLessonIds = new Set(
    lessonCompletions.map((lc) => lc.lessonId.toString())
  );

  // Map lessons → chapters
  const chapterLessonMap = {};
  lessons.forEach((lesson) => {
    const chapId = lesson.chapterId.toString();
    if (!chapterLessonMap[chapId]) chapterLessonMap[chapId] = [];
    chapterLessonMap[chapId].push(lesson);
  });

  // Map chapters → modules
  const moduleChapterMap = {};
  chapters.forEach((chapter) => {
    const modId = chapter.moduleId.toString();
    if (!moduleChapterMap[modId]) moduleChapterMap[modId] = [];
    moduleChapterMap[modId].push(chapter);
  });

  let enrichedModules = await Promise.all(
    modules.map(async (mod) => {
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

      const moduleStatus =
        totalLessons > 0 && completedLessons === totalLessons
          ? "completed"
          : "inprogress";

      // Update or insert completion record
      await ModuleCompletion.findOneAndUpdate(
        { studentId, moduleId: mod._id },
        { status: moduleStatus },
        { upsert: true, new: true }
      );

      return {
        ...mod,
        totalTime: formatDuration(totalMinutes),
        percentCompleted: `${percentCompleted}%`,
        status: moduleStatus,
      };
    })
  );

  // Apply status filtering
  if (status) {
    enrichedModules = enrichedModules.filter(
      (mod) => mod.status === status.toLowerCase()
    );
  }

  res.status(200).json({
    status: "success",
    data: enrichedModules,
    totalModules,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(totalModules / limitNum),
  });
});

// Delete Module
exports.deleteModule = catchAsync(async (req, res) => {
  const isPermission = await hasPermission(req.user?.id, "Delete Module");
  if (!isPermission ) {
    throw new ForbiddenError("User Doesn't have permission to delete module")
  }
  const { moduleId } = req.params;
  const module = await Module.findById(moduleId);
  if (!module) throw new NotFoundError('Module not found');
  await checkDependencies("Course",moduleId, ["courseId"]);
  const deletedModule = await Module.findByIdAndDelete(moduleId);
  res.status(200).json({ status: 'success', message: 'Module deleted successfully',data:deletedModule });
});
