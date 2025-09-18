const checkDependencies = require('../helper/checkDependencies');
const Chapter = require('../models/Chapter');
const Course = require('../models/Course');
const Lesson = require('../models/Lesson');
const Module = require('../models/Module');
const User = require('../models/User');
const catchAsync = require('../utils/catchAsync');

const {
  NotFoundError,
  ConflictError,
  BadRequestError,
  EmptyRequestBodyError,
  InternalServerError,
  ForbiddenError,
} = require('../utils/customErrors');

// Create Course
exports.createCourse = catchAsync(async (req, res) => {
  const { title, description, status } = req.body;
  const user = await User.findById(req.user.id).populate('roleId');
  const role = user?.roleId?.role_name?.toLowerCase();
  if( role == "student" || role == "tutor")throw new ForbiddenError("user doesn't have permission to create course")
  const existingCourse = await Course.findOne({ title: { $regex: new RegExp(`^${title}$`, "i") } });
  if (existingCourse) {
    throw new ConflictError("A course with this title already exists.");
  }
  const course = await Course.create({ title, description, createdBy:req.user.id, status });
  res.status(201).json({ status: 'success', data: course });
});

// Get All Courses
exports.getAllCourses = catchAsync(async (req, res) => {
  // 1. Pagination
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  // 2. Search
  const search = req.query.search || '';
  const searchRegex = new RegExp(search, 'i');

  // 3. Sort parsing from `sortBy=field:direction`
  let sortField = 'createdAt';
  let sortOrder = -1; // default: descending

  if (req.query.sortBy) {
    const [field, order] = req.query.sortBy.split(':');
    sortField = field || 'createdAt';
    sortOrder = order === 'asc' ? 1 : -1;
  }

  // 4. Query
  const query = {
    title: { $regex: searchRegex }
  };

  // 5. Count
  const totalCourses = await Course.countDocuments(query);

  // 6. Fetch
  const courses = await Course.find(query)
    .populate('createdBy', 'name _id email')
    .sort({ [sortField]: sortOrder })
    .skip(skip)
    .limit(limit);

  // 7. Response
  res.status(200).json({
    status: 'success',
    page,
    limit,
    total: totalCourses,
    totalPages: Math.ceil(totalCourses / limit),
    data: courses
  });
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
  const course = await Course.findById(courseId);
  if (!course) throw new NotFoundError('Course not found');
  const user = await User.findById(req.user.id).populate('roleId');
  const role = user?.roleId?.role_name?.toLowerCase();
  if( role == "student" || role == "tutor")throw new ForbiddenError("user doesn't have permission to update course")

  if (updates.title) {
    const titleConflict = await Course.findOne({ title: { $regex: new RegExp(`^${updates.title}$`, "i") }, _id: { $ne: courseId } });
    if (titleConflict) throw new ConflictError('Another course with this title already exists');
  }
  Object.assign(course, updates);
  await course.save();
  res.status(200).json({ status: 'success', data: course });
});

// Delete Course
exports.deleteCourse = catchAsync(async (req, res) => {
  const user = await User.findById(req.user.id).populate('roleId');
  const role = user?.roleId?.role_name?.toLowerCase();
  if( role == "student" )throw new ForbiddenError("user doesn't have permission to delete course")
  const { courseId } = req.params;
  const course = await Course.findById(courseId);
  if (!course) throw new NotFoundError("Course not found");
  await checkDependencies("Course",courseId, ["courseId"]);
  const deletedCourse = await Course.findByIdAndDelete(courseId);
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
