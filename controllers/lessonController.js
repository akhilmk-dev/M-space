const mongoose = require('mongoose');
const Lesson = require('../models/Lesson');
const Chapter = require('../models/Chapter');
const Module = require('../models/Module');
const Course = require('../models/Course');
const { NotFoundError, ConflictError, ForbiddenError, BadRequestError, InternalServerError } = require('../utils/customErrors');
const removeReferencesGlobally = require('../helper/removeReferencesGlobally');
const User = require('../models/User');
const Student = require('../models/Student');
const Tutor = require('../models/Tutor');
const LessonCompletion = require('../models/LessonCompletion');
const hasPermission = require('../helper/hasPermission');
const catchAsync = require('../utils/catchAsync');
const checkDependencies = require('../helper/checkDependencies');
const { sendNotificationToStudent } = require('../utils/sendNotificationToUser');

exports.createLessons = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const isPermission = await hasPermission(req.user?.id, "Add Lesson");
    if (!isPermission) {
      throw new ForbiddenError("User Doesn't have permission to create lesson");
    }

    const { courseId, moduleId, chapterId, lessons } = req.body;

    // Check Course, Module, Chapter
    const course = await Course.findById(courseId).session(session);
    if (!course) throw new Error("Invalid Course ID");

    const module = await Module.findOne({ _id: moduleId, courseId }).session(session);
    if (!module) throw new Error("Invalid Module ID");

    const chapter = await Chapter.findOne({ _id: chapterId, moduleId }).session(session);
    if (!chapter) throw new Error("Invalid Chapter ID");

    // Insert lessons
    const lessonDocs = lessons.map((lesson) => ({ ...lesson, chapterId, createdBy: req.user.id }));
    const savedLessons = await Lesson.insertMany(lessonDocs, { session });

    // Get students in the course
    const students = await Student.find({ courseId }).select("userId").session(session).lean();
    const studentIds = students.map(s => s.userId.toString());

    // Commit transaction
    await session.commitTransaction();
    session.endSession();

    // After commit, send notifications
    const lessonTitles = lessons.map(l => l.title).join(", ");
    const notificationMessage = `New lesson(s) added: ${lessonTitles}`;

    await Promise.all(
      studentIds.map((userId) =>
        sendNotificationToStudent(userId, "New Lessons Added", notificationMessage)
      )
    );

    return res.status(201).json({
      success: true,
      message: "Lessons added successfully",
      data: savedLessons,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error creating lessons:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error:err
    });
  }
};

exports.updateSingleLesson = async (req, res, next) => {

  try {
    const isPermission = await hasPermission(req.user?.id, "Edit Lesson");
    if (!isPermission) {
      throw new ForbiddenError("User Doesn't have permission to edit lesson")
    }
    const { lessonId } = req.params
    const user = await User.findById(req.user.id).populate('roleId');
    if (user?.roleId?.role_name == "Student") {
      throw new ForbiddenError("Student can't update the lesson");
    }
    const data = {
      createdBy: req.user.id,
      ...req.body
    }

    // Check if lesson exists
    const lesson = await Lesson.findById(lessonId);
    if (!lesson) {
      return res.status(404).json({ error: "Lesson not found" });
    }

    // Update lesson
    const updatedLesson = await Lesson.findByIdAndUpdate(
      lessonId,
      { $set: data },
      { new: true, runValidators: true }
    );

    return res.status(200).json({
      message: "Lesson updated successfully",
      lesson: updatedLesson,
    });
  } catch (err) {
    console.error("Update Lesson Error:", err);
    next(err);
  }
};

exports.deleteLesson = catchAsync(async (req, res) => {
  const { lessonId } = req.params;

  // Permission check
  const isPermission = await hasPermission(req.user?.id, "Delete Lesson");
  if (!isPermission) {
    throw new ForbiddenError("User doesn't have permission to delete lesson");
  }

  // Validate ObjectId
  if (!mongoose.Types.ObjectId.isValid(lessonId)) {
    throw new NotFoundError("Invalid lesson ID");
  }

  //  Check if lesson exists
  const lesson = await Lesson.findById(lessonId);
  if (!lesson) {
    throw new NotFoundError("Lesson not found");
  }

  // Example: Lessons might be referenced in Chapters, Assignments, or Attendance
  await checkDependencies("Chapter", lessonId, ["lessonId"]);
  await checkDependencies("Assignment", lessonId, ["lessonId"]);
  await checkDependencies("Attendance", lessonId, ["lessonId"]);

  //  Delete the lesson
  const deletedLesson = await Lesson.findByIdAndDelete(lessonId);

  //  Send response
  res.status(200).json({
    status: "success",
    message: "Lesson deleted successfully",
    data: deletedLesson,
  });
});

exports.getLessonById = async (req, res, next) => {
  try {
    const { lessonId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(lessonId)) {
      throw new NotFoundError('Invalid lesson ID');
    }

    // Fetch lesson and populate related chapter
    const lesson = await Lesson.findById(lessonId)
      .select('-__v -updatedAt')
      .lean();

    if (!lesson) {
      throw new NotFoundError('Lesson not found');
    }

    // Fetch the chapter to get moduleId
    const chapter = await Chapter.findById(lesson.chapterId)
      .select('moduleId')
      .lean();

    // Attach moduleId if found
    const moduleId = chapter?.moduleId || null;

    res.status(200).json({
      status: 'success',
      data: {
        ...lesson,
        moduleId,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.getLessonsByCourseId = async (req, res, next) => {
  try {
    const { courseId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      throw new NotFoundError("Invalid course ID");
    }

    // Find all modules in the course
    const modules = await Module.find({ courseId }).select('_id');
    const moduleIds = modules.map((mod) => mod._id);

    // Find all chapters in those modules
    const chapters = await Chapter.find({ moduleId: { $in: moduleIds } }).select('_id');
    const chapterIds = chapters.map((chap) => chap._id);

    // Find all lessons in those chapters
    const lessons = await Lesson.find({ chapterId: { $in: chapterIds } }).select('title _id');

    res.status(200).json({
      success: true,
      count: lessons.length,
      data: lessons,
    });
  } catch (err) {
    console.error("Error fetching lessons by course:", err);
    next(err);
  }
};

exports.getLessonsByChapterIdForTutor = async (req, res, next) => {
  try {
    const { chapterId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const tutorId = req.user.id;
    if (!mongoose.Types.ObjectId.isValid(chapterId)) {
      throw new BadRequestError("Invalid Chapter ID");
    }

    // Ensure chapter exists
    const chapter = await Chapter.findById(chapterId).lean();
    if (!chapter) throw new NotFoundError("Chapter not found");

    // Fetch related module & course
    const moduleData = await Module.findById(chapter.moduleId).lean();
    if (!moduleData) throw new NotFoundError("Module not found");

    const courseData = await Course.findById(moduleData.courseId).lean();
    if (!courseData) throw new NotFoundError("Course not found");

    const tutor = await Tutor.findOne({ userId: tutorId }).populate("userId", "status name email");
    if (!tutor) {
      throw new NotFoundError("Tutor not found ");
    }

    if (tutor.userId?.status === false) {
      throw new InternalServerError("Tutor account is inactive");
    }

    const isCourseAssigned = tutor.courseIds?.some(
      (id) => id.toString() == courseData._id.toString()
    );

    if (!isCourseAssigned) {
      throw new InternalServerError("You are not assigned to this course");
    }

    // Pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.max(1, parseInt(limit));
    const skip = (pageNum - 1) * limitNum;

    // Fetch lessons
    const lessons = await Lesson.find({ chapterId })
      .sort({ orderIndex: 1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const totalLessons = await Lesson.countDocuments({ chapterId });

    const data = lessons.map((lesson) => ({
      ...lesson,
      chapterId: chapter._id,
      moduleId: moduleData._id,
      courseId: courseData._id,
    }));

    res.status(200).json({
      status: "success",
      totalLessons,
      currentPage: pageNum,
      totalPages: Math.ceil(totalLessons / limitNum),
      data,
    });
  } catch (err) {
    console.error("Error fetching lessons for tutor:", err);
    next(err);
  }
};

exports.getLessonsByChapterIdForStudent = async (req, res, next) => {
  try {
    const { chapterId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const studentId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(chapterId)) {
      throw new InternalServerError("Invalid Chapter ID");
    }

    // Ensure chapter exists
    const chapter = await Chapter.findById(chapterId).lean();
    if (!chapter) throw new NotFoundError("Chapter not found");

    // Fetch related module & course
    const moduleData = await Module.findById(chapter.moduleId).lean();
    if (!moduleData) throw new NotFoundError("Module not found");

    const courseData = await Course.findById(moduleData.courseId).lean();
    if (!courseData) throw new NotFoundError("Course not found");

    const student = await Student.findOne({ userId: studentId }).populate("userId", "status name email");
    if (!student) {
      throw new NotFoundError("Student not found or not enrolled in any course");
    }

    if (student.userId?.status === false) {
      throw new InternalServerError("Student account is inactive");
    }

    if (!student.courseId || student.courseId.toString() !== courseData._id.toString()) {
      throw new InternalServerError("You are not enrolled in this course");
    }

    // Pagination setup
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.max(1, parseInt(limit));
    const skip = (pageNum - 1) * limitNum;

    // Fetch lessons for chapter
    const lessons = await Lesson.find({ chapterId })
      .sort({ orderIndex: 1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const totalLessons = await Lesson.countDocuments({ chapterId });

    // Fetch completed lessons for the student
    const completed = await LessonCompletion.find({
      studentId,
      lessonId: { $in: lessons.map((l) => l._id) },
      isCompleted: true,
    }).select("lessonId");

    const completedLessonIds = new Set(completed.map((c) => c.lessonId.toString()));

    // Build final response
    const data = lessons.map((lesson) => ({
      ...lesson,
      isCompleted: completedLessonIds.has(lesson._id.toString()),
      chapterId: chapter._id,
      moduleId: moduleData._id,
      courseId: courseData._id,
    }));

    res.status(200).json({
      status: "success",
      totalLessons,
      currentPage: pageNum,
      totalPages: Math.ceil(totalLessons / limitNum),
      data,
    });
  } catch (err) {
    console.error("Error fetching lessons for student:", err);
    next(err);
  }
};

exports.getAllLessons = async (req, res, next) => {
  try {
    const isPermission = await hasPermission(req.user?.id, "List Lesson");
    if (!isPermission) {
      throw new ForbiddenError("User Doesn't have permission to list lesson");
    }

    const {
      chapterId,
      createdBy,
      search = "",
      page = 1,
      limit = 10
    } = req.query;

    const filter = {};

    // Filters
    if (chapterId) filter.chapterId = chapterId;
    if (createdBy) filter.createdBy = createdBy;
    if (search) filter.title = { $regex: search, $options: "i" };

    // Pagination setup
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.max(1, parseInt(limit));
    const skip = (pageNum - 1) * limitNum;

    let sortField = 'createdAt';
    let sortOrder = -1;
    if (req.query.sortBy) {
      const [field, order] = req.query.sortBy.split(':');
      sortField = field || 'createdAt';
      sortOrder = order === 'asc' ? 1 : -1;
    }

    const lessons = await Lesson.find(filter)
      .populate({
        path: "chapterId",
        select: "title moduleId",
        populate: {
          path: "moduleId",
          select: "title courseId",
          populate: { path: "courseId", select: "title" },
        },
      }).populate({
        path: "createdBy",
        select: "_id name email",
      }).sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const total = await Lesson.countDocuments(filter);

    res.status(200).json({
      status: "success",
      total,
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum),
      data: lessons,
    });
  } catch (err) {
    console.error("Error fetching all lessons:", err);
    next(err);
  }
};


// exports.updateLessons = async (req, res, next) => {
//   try {
//     const { courseId, moduleId, chapterId } = req.params;

//     // Validate IDs
//     if (!mongoose.Types.ObjectId.isValid(courseId)) throw new NotFoundError('Invalid course ID');
//     if (!mongoose.Types.ObjectId.isValid(moduleId)) throw new NotFoundError('Invalid module ID');
//     if (!mongoose.Types.ObjectId.isValid(chapterId)) throw new NotFoundError('Invalid chapter ID');

//     // Check hierarchy
//     const course = await Course.findById(courseId);
//     if (!course) throw new NotFoundError('Course not found');

//     const module = await Module.findOne({ _id: moduleId, courseId });
//     if (!module) throw new NotFoundError('Module not found or does not belong to course');

//     const chapter = await Chapter.findOne({ _id: chapterId, moduleId });
//     if (!chapter) throw new NotFoundError('Chapter not found or does not belong to module');

//     // Validate input
//     const inputLessons = req.body;
//     if (!Array.isArray(inputLessons) || inputLessons.length === 0)
//       throw new NotFoundError('Lessons array is required and cannot be empty');

//     // Fetch existing lessons
//     const existingLessons = await Lesson.find({ chapterId });
//     const existingLessonMap = Object.fromEntries(existingLessons.map(l => [l._id.toString(), l]));

//     const keepLessonIds = [];
//     const createdOrUpdated = [];

//     for (const [index, lesson] of inputLessons.entries()) {
//       const { error, value } = lessonSchema.validate(lesson, { abortEarly: false });
//       if (error) {
//         error.details = error.details.map(d => ({
//           ...d,
//           message: `Lesson ${index + 1}: ${d.message}`
//         }));
//         error.isJoi = true;
//         throw error;
//       }

//       let lessonDoc;

//       if (lesson._id) {
//         if (!mongoose.Types.ObjectId.isValid(lesson._id)) {
//           throw new NotFoundError(`Invalid lesson ID at index ${index + 1}`);
//         }

//         // If lesson with _id doesn't belong to the current chapter
//         if (!existingLessonMap[lesson._id]) {
//           throw new NotFoundError(`Lesson not found or doesn't belong to chapter: ${lesson._id}`);
//         }

//         lessonDoc = existingLessonMap[lesson._id];
//         lessonDoc.set(value);
//         await lessonDoc.save();
//       } else {
//         lessonDoc = await Lesson.create({ ...value, chapterId });
//       }

//       keepLessonIds.push(lessonDoc._id.toString());
//       createdOrUpdated.push(lessonDoc);
//     }

//     // Delete removed lessons
//     const toDeleteLessonIds = Object.keys(existingLessonMap).filter(
//       id => !keepLessonIds.includes(id)
//     );

//     if (toDeleteLessonIds.length > 0) {
//       await Lesson.deleteMany({ _id: { $in: toDeleteLessonIds } });
//       await removeReferencesGlobally('lessonId', toDeleteLessonIds);
//     }

//     res.status(200).json({
//       status: 'success',
//       message: `${createdOrUpdated.length} lesson(s) processed. ${toDeleteLessonIds.length} removed.`,
//       data: createdOrUpdated,
//     });
//   } catch (err) {
//     next(err);
//   }
// };

