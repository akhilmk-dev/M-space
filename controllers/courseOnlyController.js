const Chapter = require('../models/Chapter');
const Course = require('../models/Course');
const Lesson = require('../models/Lesson');
const Module = require('../models/Module');
const catchAsync = require('../utils/catchAsync');

const {
  NotFoundError,
  ConflictError,
  BadRequestError,
  EmptyRequestBodyError,
} = require('../utils/customErrors');

// Create Course
exports.createCourse = catchAsync(async (req, res) => {
  const { title, description, createdBy, status } = req.body;

  const existingCourse = await Course.findOne({ title });
  if (existingCourse) {
    throw new ConflictError("A course with this title already exists.");
  }

  const course = await Course.create({ title, description, createdBy, status });
  res.status(201).json({ status: 'success', data: course });
});

// Get All Courses
exports.getAllCourses = catchAsync(async (req, res) => {
  const courses = await Course.find().populate('createdBy', 'name email');
  res.status(200).json({ status: 'success', data: courses });
});

// Get Course by ID
exports.getCourseById = catchAsync(async (req, res) => {
  const { courseId } = req.params;
  const course = await Course.findById(courseId).populate('createdBy', 'name email');
  if (!course) throw new NotFoundError('Course not found');
  res.status(200).json({ status: 'success', data: course });
});

// Update Course
exports.updateCourse = catchAsync(async (req, res) => {
  const { courseId } = req.params;
  const updates = req.body;

  if (!Object.keys(updates).length) {
    throw new EmptyRequestBodyError();
  }

  const course = await Course.findById(courseId);
  if (!course) throw new NotFoundError('Course not found');

  if (updates.title) {
    const titleConflict = await Course.findOne({ title: updates.title, _id: { $ne: courseId } });
    if (titleConflict) throw new ConflictError('Another course with this title already exists');
  }

  Object.assign(course, updates);
  await course.save();

  res.status(200).json({ status: 'success', data: course });
});

// Delete Course
exports.deleteCourse = catchAsync(async (req, res) => {
  const { courseId } = req.params;
  const course = await Course.findByIdAndDelete(courseId);

  if (!course) throw new NotFoundError('Course not found');

  res.status(200).json({ status: 'success', message: 'Course deleted successfully' });
});

exports.geFullCourseById = async (req, res, next) => {
  try {
    const { courseId } = req.params;

    // Fetch the course
    const course = await Course.findById(courseId).select('-__v -updatedAt');
    if (!course) {
      throw new NotFoundError("Course not found.");
    }

    // Fetch related modules
    const modules = await Module.find({ courseId }).select('-__v -updatedAt');
    const moduleIds = modules.map(m => m._id);

    // Fetch related chapters
    const chapters = await Chapter.find({ moduleId: { $in: moduleIds } }).select('-__v -updatedAt');
    const chapterIds = chapters.map(c => c._id);

    // Fetch related lessons
    const lessons = await Lesson.find({ chapterId: { $in: chapterIds } }).select('-__v -updatedAt');

    // Nest structure: modules → chapters → lessons
    const structuredModules = modules.map(mod => ({
      ...mod.toObject(),
      chapters: chapters
        .filter(ch => ch.moduleId.equals(mod._id))
        .map(ch => ({
          ...ch.toObject(),
          lessons: lessons.filter(ls => ls.chapterId.equals(ch._id))
        }))
    }));

    const result = {
      ...course.toObject(),
      modules: structuredModules
    };

    res.status(200).json({ status: "success", data: result });
  } catch (err) {
    next(err);
  }
};
