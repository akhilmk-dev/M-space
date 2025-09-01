const mongoose = require('mongoose');
const { courseSchema } = require('../validations/courseWithStructureValidation');
const Course = require('../models/Course');
const Module = require('../models/Module');
const Chapter = require('../models/Chapter');
const Lesson = require('../models/Lesson');
const { BadRequestError, ConflictError, NotFoundError } = require('../utils/customErrors');
const User = require('../models/User');

const createCourseWithHierarchy = async (req, res, next) => {
    try {
      const { error, value } = courseSchema.validate(req.body, { abortEarly: false });
      if (error) {
        error.isJoi = true;
        throw error;
      }
  
      const { title, description, createdBy, status, modules = [] } = value;

      const userExists = await User.findById(createdBy);
        if (!userExists) {
        throw new NotFoundError('User does not exist');
        }
  
      // 1. Check if course title exists
      const existingCourse = await Course.findOne({ title });
      if (existingCourse) {
        throw new ConflictError('Course title already exists');
      }
  
      // 2. Create course first (to use courseId for module-level checks)
      const course = await Course.create({ title, description, createdBy, status });
  
      // 3. Track modules
      const seenModuleTitles = new Set();
  
      for (const mod of modules) {
        // Check for duplicates in current request
        if (seenModuleTitles.has(mod.title)) {
          throw new ConflictError(`Duplicate module title in request: '${mod.title}'`);
        }
        seenModuleTitles.add(mod.title);
  
        // Check for duplicate in DB for same course
        const existingMod = await Module.findOne({ courseId: course._id, title: mod.title });
        if (existingMod) {
          throw new ConflictError(`Module with title '${mod.title}' already exists in this course`);
        }
  
        // Create module
        const savedModule = await Module.create({
          courseId: course._id,
          title: mod.title,
          orderIndex: mod.orderIndex,
        });
  
        const seenChapterTitles = new Set();
  
        for (const chap of mod.chapters || []) {
          // Check for chapter title duplicates in request
          if (seenChapterTitles.has(chap.title)) {
            throw new ConflictError(`Duplicate chapter title in module '${mod.title}': '${chap.title}'`);
          }
          seenChapterTitles.add(chap.title);
  
          // Check chapter in DB
          const existingChap = await Chapter.findOne({ moduleId: savedModule._id, title: chap.title });
          if (existingChap) {
            throw new ConflictError(`Chapter '${chap.title}' already exists in module '${mod.title}'`);
          }
  
          const savedChapter = await Chapter.create({
            moduleId: savedModule._id,
            title: chap.title,
            orderIndex: chap.orderIndex,
          });
  
          const seenLessonTitles = new Set();
  
          for (const les of chap.lessons || []) {
            // Check duplicate in request
            if (seenLessonTitles.has(les.title)) {
              throw new ConflictError(`Duplicate lesson title in chapter '${chap.title}': '${les.title}'`);
            }
            seenLessonTitles.add(les.title);
  
            // Check lesson in DB
            const existingLesson = await Lesson.findOne({ chapterId: savedChapter._id, title: les.title });
            if (existingLesson) {
              throw new ConflictError(`Lesson '${les.title}' already exists in chapter '${chap.title}'`);
            }
  
            await Lesson.create({
              chapterId: savedChapter._id,
              title: les.title,
              contentType: les.contentType,
              contentURL: les.contentURL,
              duration: les.duration,
              orderIndex: les.orderIndex,
            });
          }
        }
      }
  
      res.status(201).json({
        message: 'Course created successfully',
        courseId: course._id,
      });
    } catch (err) {
      if (err.code === 11000) {
        const field = Object.keys(err.keyValue).join(', ');
        return next(new ConflictError(`Duplicate entry: ${field}`));
      }
      next(err);
    }
  };

  const updateCourseWithHierarchy = async (req, res, next) => {
    try {
      const { courseId } = req.params;
      const { error, value } = courseSchema.validate(req.body, { abortEarly: false });
      if (error) {
        error.isJoi = true;
        throw error;
      }
  
      const course = await Course.findById(courseId);
      if (!course) throw new NotFoundError("Course not found.");
  
      const { title, description, createdBy, status, modules = [] } = value;
  
      // Duplicate title among all courses
      const dupCourse = await Course.findOne({ title, _id: { $ne: courseId } });
      if (dupCourse) throw new ConflictError("Another course with the same title exists.");
  
      // Validate duplicates within request payload
      const moduleTitles = modules.map(m => m.title);
      if (new Set(moduleTitles).size !== moduleTitles.length)
        throw new ConflictError("Duplicate module titles in request.");
  
      modules.forEach((mod, mIdx) => {
        if (mod.chapters) {
          const chapTitles = mod.chapters.map(c => c.title);
          if (new Set(chapTitles).size !== chapTitles.length)
            throw new ConflictError(`Duplicate chapter titles in module '${mod.title}'.`);
        }
      });
  
      // Update course metadata
      course.set({ title, description, createdBy, status });
      await course.save();
  
      // Remove existing hierarchy
      const existingModules = await Module.find({ courseId });
      const existingModuleIds = existingModules.map((m) => m._id);
  
      const existingChapters = await Chapter.find({ moduleId: { $in: existingModuleIds } });
      const existingChapterIds = existingChapters.map((c) => c._id);
  
      await Lesson.deleteMany({ chapterId: { $in: existingChapterIds } });
      await Chapter.deleteMany({ moduleId: { $in: existingModuleIds } });
      await Module.deleteMany({ courseId });
  
      // Recreate full hierarchy
      for (const mod of modules) {
        const newMod = await Module.create({ courseId: course._id, title: mod.title, orderIndex: mod.orderIndex });
        if (mod.chapters) {
          for (const chap of mod.chapters) {
            const newChap = await Chapter.create({ moduleId: newMod._id, title: chap.title, orderIndex: chap.orderIndex });
            if (chap.lessons) {
              const newLessons = chap.lessons.map(ls => ({
                chapterId: newChap._id,
                title: ls.title,
                contentType: ls.contentType,
                contentURL: ls.contentURL,
                duration: ls.duration,
                orderIndex: ls.orderIndex,
              }));
              await Lesson.insertMany(newLessons);
            }
          }
        }
      }
  
      res.json({ message: "Course updated with its hierarchy successfully." });
    } catch (err) {
      if (err.code === 11000) {
        const field = Object.keys(err.keyValue).join(', ');
        return next(new ConflictError(`Duplicate entry for: ${field}`));
      }
      next(err);
    }
  };

  const deleteCourseWithHierarchy = async (req, res, next) => {
    try {
      const { courseId } = req.params;
      const course = await Course.findById(courseId);
      if (!course) throw new NotFoundError("Course not found.");
  
      const modules = await Module.find({ courseId });
      const moduleIds = modules.map((m) => m._id);
      const chapters = await Chapter.find({ moduleId: { $in: moduleIds } });
      const chapterIds = chapters.map((c) => c._id);
  
      await Lesson.deleteMany({ chapterId: { $in: chapterIds } });
      await Chapter.deleteMany({ moduleId: { $in: moduleIds } });
      await Module.deleteMany({ courseId });
      await Course.deleteOne({ _id: courseId });
  
      res.json({status:"success", message: "Course deleted successfully." });
    } catch (err) {
      next(err);
    }
  };
  
  const getCourseWithHierarchy = async (req, res, next) => {
    try {
      const { courseId } = req.params;
  
      const course = await Course.findById(courseId).select('-__v -updatedAt');
      if (!course) throw new NotFoundError("Course not found.");
  
      const modules = await Module.find({ courseId }).select('-__v -updatedAt');
      const moduleIds = modules.map((m) => m._id);
  
      const chapters = await Chapter.find({ moduleId: { $in: moduleIds } }).select('-__v -updatedAt');
      const chapterIds = chapters.map((c) => c._id);
  
      const lessons = await Lesson.find({ chapterId: { $in: chapterIds } }).select('-__v -updatedAt');
  
      const structured = modules.map((mod) => ({
        ...mod.toObject(),
        chapters: chapters
          .filter((ch) => ch.moduleId.equals(mod._id))
          .map((ch) => ({
            ...ch.toObject(),
            lessons: lessons.filter((ls) => ls.chapterId.equals(ch._id)),
          })),
      }));
  
      res.json({status:"success",data:{ course, modules: structured }});
    } catch (err) {
      next(err);
    }
  };
 
  const getAllCoursesWithHierarchy = async (req, res, next) => {
    try {
      const courses = await Course.find().select('-__v -updatedAt');
      const allCourseIds = courses.map(c => c._id);
  
      const modules = await Module.find({ courseId: { $in: allCourseIds } }).select('-__v -updatedAt');
      const moduleIds = modules.map(m => m._id);
  
      const chapters = await Chapter.find({ moduleId: { $in: moduleIds } }).select('-__v -updatedAt');
      const chapterIds = chapters.map(c => c._id);
  
      const lessons = await Lesson.find({ chapterId: { $in: chapterIds } }).select('-__v -updatedAt');
  
      const result = courses.map(course => {
        const courseModules = modules.filter(m => m.courseId.equals(course._id));
        const structuredModules = courseModules.map(mod => ({
          ...mod.toObject(),
          chapters: chapters
            .filter(ch => ch.moduleId.equals(mod._id))
            .map(ch => ({
              ...ch.toObject(),
              lessons: lessons.filter(ls => ls.chapterId.equals(ch._id))
            }))
        }));
  
        return {
          ...course.toObject(),
          modules: structuredModules
        };
      });
  
      res.status(200).json({ status: "success", data: result });
    } catch (err) {
      next(err);
    }
  };

  const getCoursesByUser = async (req, res, next) => {
    try {
      const { userId } = req.params;
  
      const courses = await Course.find({ createdBy: userId }).select('-__v -updatedAt');
      if (!courses.length) {
        throw new NotFoundError("No courses found for this user.");
      }
  
      const courseIds = courses.map(c => c._id);
      const modules = await Module.find({ courseId: { $in: courseIds } }).select('-__v -updatedAt');
      const moduleIds = modules.map(m => m._id);
  
      const chapters = await Chapter.find({ moduleId: { $in: moduleIds } }).select('-__v -updatedAt');
      const chapterIds = chapters.map(c => c._id);
  
      const lessons = await Lesson.find({ chapterId: { $in: chapterIds } }).select('-__v -updatedAt');
  
      const result = courses.map(course => {
        const courseModules = modules.filter(m => m.courseId.equals(course._id));
        const structuredModules = courseModules.map(mod => ({
          ...mod.toObject(),
          chapters: chapters
            .filter(ch => ch.moduleId.equals(mod._id))
            .map(ch => ({
              ...ch.toObject(),
              lessons: lessons.filter(ls => ls.chapterId.equals(ch._id))
            }))
        }));
  
        return {
          ...course.toObject(),
          modules: structuredModules
        };
      });
  
      res.status(200).json({ status: "success", data: result });
    } catch (err) {
      next(err);
    }
  };
  

module.exports = {
  createCourseWithHierarchy,
  updateCourseWithHierarchy,
  deleteCourseWithHierarchy,
  getCourseWithHierarchy,
  getAllCoursesWithHierarchy,
  getCoursesByUser
};
