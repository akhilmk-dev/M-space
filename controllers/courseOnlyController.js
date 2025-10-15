const { default: mongoose } = require('mongoose');
const checkDependencies = require('../helper/checkDependencies');
const Assignment = require('../models/Assignment');
const Chapter = require('../models/Chapter');
const Course = require('../models/Course');
const Lesson = require('../models/Lesson');
const Module = require('../models/Module');
const Tutor = require('../models/Tutor');
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
const { uploadBase64ToS3 } = require('../utils/s3Uploader');
const hasPermission = require('../helper/hasPermission');

// Create Course
exports.createCourse = catchAsync(async (req, res) => {
  const { title, description, status, thumbnail } = req.body;
  const isPermission = await hasPermission(req.user?.id, "Add Course");
  if (!isPermission ) {
    throw new ForbiddenError("User Doesn't have permission to Create Course")
  }
  // Validate required fields
  if (!title || !thumbnail) {
    throw new BadRequestError("Title and thumbnail are required");
  }

  // Validate user role
  const user = await User.findById(req.user.id).populate("roleId");
  const role = user?.roleId?.role_name?.toLowerCase();
  if (role === "student" || role === "tutor") {
    throw new ForbiddenError("User doesn't have permission to create a course");
  }

  // Check for duplicate title (case-insensitive)
  const existingCourse = await Course.findOne({
    title: { $regex: new RegExp(`^${title}$`, "i") },
  });
  if (existingCourse) {
    throw new ConflictError("A course with this title already exists.");
  }

  // Upload thumbnail
  let thumbnailUrl = null;
  try {
    thumbnailUrl = await uploadBase64ToS3(thumbnail, "course-thumbnails");
  } catch (err) {
    throw new BadRequestError("Error uploading thumbnail to S3: " + err.message);
  }

  // Create course
  const course = await Course.create({
    title,
    description,
    status,
    thumbnail: thumbnailUrl,
    createdBy: req.user.id,
  });

  // Response (matching createModule style)
  res.status(201).json({
    status: "success",
    data: {
      _id: course._id,
      title: course.title,
      description: course.description,
      status: course.status,
      thumbnail: course.thumbnail,
      createdBy: {
        _id: user._id,
        name: user.name,
        role: user?.roleId?.role_name,
      },
    },
  });
});

// Get All Courses
exports.getAllCourses = catchAsync(async (req, res) => {
  const isPermission = await hasPermission(req.user?.id, "List Course");
  if (!isPermission ) {
    throw new ForbiddenError("User Doesn't have permission to list course")
  }
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
  const isPermission = await hasPermission(req.user?.id, "Edit Course");
  if (!isPermission ) {
    throw new ForbiddenError("User Doesn't have permission to edit course")
  }
  // Find course
  const course = await Course.findById(courseId);
  if (!course) throw new NotFoundError("Course not found");

  // Role validation
  const user = await User.findById(req.user.id).populate("roleId");
  const role = user?.roleId?.role_name?.toLowerCase();
  if (role === "student" || role === "tutor") {
    throw new ForbiddenError("User doesn't have permission to update course");
  }

  // Check for duplicate title
  if (updates.title) {
    const duplicate = await Course.findOne({
      _id: { $ne: courseId },
      title: { $regex: new RegExp(`^${updates.title}$`, "i") },
    });
    if (duplicate) {
      throw new ConflictError("Another course with this title already exists");
    }
  }

  // Handle thumbnail update
  if (updates.thumbnail) {
    const thumb = updates.thumbnail;

    if (thumb.startsWith("data:")) {
      // Upload new thumbnail if base64
      try {
        const thumbnailUrl = await uploadBase64ToS3(thumb, "course-thumbnails");
        updates.thumbnail = thumbnailUrl;
      } catch (err) {
        throw new BadRequestError("Error uploading thumbnail to S3: " + err.message);
      }
    } else if (thumb === null || thumb.trim() === "") {
      // Explicitly null or empty string → ignore updating
      delete updates.thumbnail;
    } else if (thumb.startsWith("http")) {
      // Already an S3 URL → ignore updating
      delete updates.thumbnail;
    }
  }

  // Apply updates
  Object.assign(course, updates);
  await course.save();

  // Response
  res.status(200).json({
    status: "success",
    message: "Course updated successfully",
    data: {
      _id: course._id,
      title: course.title,
      description: course.description,
      status: course.status,
      thumbnail: course.thumbnail,
      createdAt:course?.createdAt,
      createdBy: {
        _id: user._id,
        name: user.name,
        role: user?.roleId?.role_name,
      },
    },
  });
});

// Delete Course
exports.deleteCourse = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  const isPermission = await hasPermission(req.user?.id, "Delete Course");
  if (!isPermission ) {
    throw new ForbiddenError("User Doesn't have permission to delete course")
  }
  try {
    const user = await User.findById(req.user.id).populate("roleId").session(session);
    const role = user?.roleId?.role_name?.toLowerCase();

    // Prevent student from deleting courses
    if (role === "student") {
      throw new ForbiddenError("User doesn't have permission to delete course");
    }

    const { courseId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      throw new BadRequestError("Invalid course ID");
    }

    const course = await Course.findById(courseId).session(session);
    if (!course) throw new NotFoundError("Course not found");

    //  Prevent deletion if dependencies exist
    await checkDependencies("Course", course._id, [
      "courseId"
    ]);

    // Delete the course
    const deletedCourse = await Course.findByIdAndDelete(courseId).session(session);

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      status: "success",
      message: "Course deleted successfully",
      data: deletedCourse,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

exports.geFullCourseById = async (req, res, next) => {
  try {
    const { courseId } = req.params;

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const skip = (page - 1) * limit;

    // Fetch the course
    const course = await Course.findById(courseId).select("-__v -updatedAt");
    if (!course) {
      throw new NotFoundError("Course not found.");
    }

    // Count total modules
    const totalModules = await Module.countDocuments({ courseId });

    // Fetch related modules with pagination
    const modules = await Module.find({ courseId })
      .select("-__v -updatedAt")
      .skip(skip)
      .limit(limit);

    const moduleIds = modules.map((m) => m._id);

    // Fetch related chapters
    const chapters = await Chapter.find({ moduleId: { $in: moduleIds } }).select(
      "-__v -updatedAt"
    );
    const chapterIds = chapters.map((c) => c._id);

    // Fetch related lessons
    const lessons = await Lesson.find({ chapterId: { $in: chapterIds } }).select(
      "-__v -updatedAt"
    );

    // Nest structure: modules → chapters → lessons
    const structuredModules = modules.map((mod) => ({
      ...mod.toObject(),
      chapters: chapters
        .filter((ch) => ch.moduleId.equals(mod._id))
        .map((ch) => ({
          ...ch.toObject(),
          lessons: lessons.filter((ls) => ls.chapterId.equals(ch._id)),
        })),
    }));

    const result = {
      ...course.toObject(),
      modules: structuredModules,
    };

    res.status(200).json({
      status: "success",
      totalModules,
      page,
      limit,
      totalPages: Math.ceil(totalModules / limit),
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

exports.getCoursesByAssignedTutor = catchAsync(async (req, res) => {
  const { tutorId } = req.params;

  // 1. Check if tutor exists and role is tutor
  const tutorUser = await User.findById(tutorId).populate("roleId");
  if (!tutorUser) throw new NotFoundError("Tutor not found");

  const role = tutorUser?.roleId?.role_name?.toLowerCase();
  if (role !== "tutor") {
    throw new BadRequestError("Provided user is not a tutor");
  }

  // Fetch tutor document to get assigned course IDs
  const tutor = await Tutor.findOne({ userId: tutorId }).lean();
  if (!tutor) throw new NotFoundError("Tutor not found");

  const courseIds = tutor.courseIds || [];
  if (courseIds.length === 0) {
    return res.status(200).json({
      status: "success",
      total: 0,
      page: 1,
      limit: 0,
      totalPages: 0,
      data: [],
    });
  }

  //  Pagination
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const search = req.query.search || ''
  const skip = (page - 1) * limit;

  const filter = { 
    _id: { $in: courseIds },
    status: true, 
  };

  if (search) {
    filter.title = { $regex: search, $options: "i" }; 
  }

  //  Count total
  const total = await Course.countDocuments(filter);

  // Fetch courses with pagination + sorting
  const courses = await Course.find(filter)
    .populate("createdBy", "name email _id")
    .sort({ title: 1 }) 
    .skip(skip)
    .limit(limit);

  // 6. Response
  res.status(200).json({
    status: "success",
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    data: courses,
  });
});

exports.getActiveCourses = catchAsync(async (req, res) => {
  // const isPermission = await hasPermission(req.user?.id, "List Course");
  // if (!isPermission) {
  //   throw new ForbiddenError("User doesn't have permission to list courses");
  // }

  // Query only courses with status = true
  const courses = await Course.find({ status: true })
    .select("_id title") 
    .sort({ title: 1 });

  res.status(200).json({
    status: "success",
    total: courses.length,
    data: courses,
  });
});


