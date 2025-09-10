const Module = require('../models/Module');
const Course = require('../models/Course');
const catchAsync = require('../utils/catchAsync');
const {
  NotFoundError,
  ConflictError,
  BadRequestError,
  EmptyRequestBodyError,
} = require('../utils/customErrors');

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

// 🔹 Get Modules by Course ID
exports.getModulesByCourseId = catchAsync(async (req, res) => {
  const { courseId } = req.params;

  if (!courseId) {
    throw new BadRequestError('Course ID is required');
  }

  const course = await Course.findById(courseId);
  if (!course) {
    throw new NotFoundError('Course not found');
  }

  const modules = await Module.find({ courseId })
    .sort({ orderIndex: 1 }) // optional: sort by orderIndex
    .populate('courseId', 'title');

  res.status(200).json({
    status: 'success',
    data: modules,
  });
});


// 🔸 Delete Module
exports.deleteModule = catchAsync(async (req, res) => {
  const { moduleId } = req.params;
  const module = await Module.findByIdAndDelete(moduleId);

  if (!module) throw new NotFoundError('Module not found');

  res.status(200).json({ status: 'success', message: 'Module deleted successfully' });
});
