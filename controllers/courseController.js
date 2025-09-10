const mongoose = require('mongoose');
const { courseSchema } = require('../validations/courseWithStructureValidation');
const Course = require('../models/Course');
const Module = require('../models/Module');
const Chapter = require('../models/Chapter');
const Lesson = require('../models/Lesson');
const { BadRequestError, ConflictError, NotFoundError } = require('../utils/customErrors');
const User = require('../models/User');
const removeReferencesGlobally = require('../helper/removeReferencesGlobally');
const { updateCourseSchema } = require('../validations/updateCourse');

// const createCourseWithHierarchy = async (req, res, next) => {
//     try {
//       const { error, value } = courseSchema.validate(req.body, { abortEarly: false });
//       if (error) {
//         error.isJoi = true;
//         throw error;
//       }
  
//       const { title, description, createdBy, status, modules = [] } = value;

//       const userExists = await User.findById(createdBy);
//         if (!userExists) {
//         throw new NotFoundError('User does not exist');
//         }
  
//       // 1. Check if course title exists
//       const existingCourse = await Course.findOne({ title });
//       if (existingCourse) {
//         throw new ConflictError('Course title already exists');
//       }
  
//       // 2. Create course first (to use courseId for module-level checks)
//       const course = await Course.create({ title, description, createdBy, status });
  
//       // 3. Track modules
//       const seenModuleTitles = new Set();
  
//       for (const mod of modules) {
//         // Check for duplicates in current request
//         if (seenModuleTitles.has(mod.title)) {
//           throw new ConflictError(`Duplicate module title in request: '${mod.title}'`);
//         }
//         seenModuleTitles.add(mod.title);
  
//         // Check for duplicate in DB for same course
//         const existingMod = await Module.findOne({ courseId: course._id, title: mod.title });
//         if (existingMod) {
//           throw new ConflictError(`Module with title '${mod.title}' already exists in this course`);
//         }
  
//         // Create module
//         const savedModule = await Module.create({
//           courseId: course._id,
//           title: mod.title,
//           orderIndex: mod.orderIndex,
//         });
  
//         const seenChapterTitles = new Set();
  
//         for (const chap of mod.chapters || []) {
//           // Check for chapter title duplicates in request
//           if (seenChapterTitles.has(chap.title)) {
//             throw new ConflictError(`Duplicate chapter title in module '${mod.title}': '${chap.title}'`);
//           }
//           seenChapterTitles.add(chap.title);
  
//           // Check chapter in DB
//           const existingChap = await Chapter.findOne({ moduleId: savedModule._id, title: chap.title });
//           if (existingChap) {
//             throw new ConflictError(`Chapter '${chap.title}' already exists in module '${mod.title}'`);
//           }
  
//           const savedChapter = await Chapter.create({
//             moduleId: savedModule._id,
//             title: chap.title,
//             orderIndex: chap.orderIndex,
//           });
  
//           const seenLessonTitles = new Set();
  
//           for (const les of chap.lessons || []) {
//             // Check duplicate in request
//             if (seenLessonTitles.has(les.title)) {
//               throw new ConflictError(`Duplicate lesson title in chapter '${chap.title}': '${les.title}'`);
//             }
//             seenLessonTitles.add(les.title);
  
//             // Check lesson in DB
//             const existingLesson = await Lesson.findOne({ chapterId: savedChapter._id, title: les.title });
//             if (existingLesson) {
//               throw new ConflictError(`Lesson '${les.title}' already exists in chapter '${chap.title}'`);
//             }
  
//             await Lesson.create({
//               chapterId: savedChapter._id,
//               title: les.title,
//               contentType: les.contentType,
//               contentURL: les.contentURL,
//               duration: les.duration,
//               orderIndex: les.orderIndex,
//             });
//           }
//         }
//       }
  
//       res.status(201).json({
//         status:"success",
//         message: 'Course created successfully',
//         courseId: course._id,
//       });
//     } catch (err) {
//       if (err.code === 11000) {
//         const field = Object.keys(err.keyValue).join(', ');
//         return next(new ConflictError(`Duplicate entry: ${field}`));
//       }
//       next(err);
//     }
//   };

// const updateCourseWithHierarchy = async (req, res, next) => {
//   try {
//     const { courseId } = req.params;

//     // 1. Validate request body
//     const { error, value } = updateCourseSchema.validate(req.body, { abortEarly: false });
//     if (error) {
//       error.isJoi = true;
//       throw error;
//     }

//     const course = await Course.findById(courseId);
//     if (!course) throw new NotFoundError("Course not found.");

//     const { title, description, createdBy, status, modules = [] } = value;

//     // 2. Check for duplicate course title
//     const dupCourse = await Course.findOne({ title, _id: { $ne: courseId } });
//     if (dupCourse) throw new ConflictError("Another course with the same title exists.");

//     // 3. Validate duplicate module and chapter titles
//     const moduleTitles = modules.map(m => m.title);
//     if (new Set(moduleTitles).size !== moduleTitles.length)
//       throw new ConflictError("Duplicate module titles in request.");

//     for (const mod of modules) {
//       if (mod.chapters) {
//         const chapTitles = mod.chapters.map(c => c.title);
//         if (new Set(chapTitles).size !== chapTitles.length)
//           throw new ConflictError(`Duplicate chapter titles in module '${mod.title}'.`);
//       }
//     }

//     // 4. Validate provided module/chapter/lesson IDs exist in DB
//     const providedModuleIds = modules.map(m => m._id).filter(Boolean);
//     const providedChapterIds = modules.flatMap(m => m.chapters || []).map(c => c._id).filter(Boolean);
//     const providedLessonIds = modules.flatMap(m => m.chapters || []).flatMap(c => c.lessons || []).map(l => l._id).filter(Boolean);

//     const [validModules, validChapters, validLessons] = await Promise.all([
//       Module.find({ _id: { $in: providedModuleIds } }, '_id'),
//       Chapter.find({ _id: { $in: providedChapterIds } }, '_id'),
//       Lesson.find({ _id: { $in: providedLessonIds } }, '_id'),
//     ]);

//     const validModuleIdsSet = new Set(validModules.map(m => m._id.toString()));
//     const validChapterIdsSet = new Set(validChapters.map(c => c._id.toString()));
//     const validLessonIdsSet = new Set(validLessons.map(l => l._id.toString()));

//     const invalidModuleIds = providedModuleIds.filter(id => !validModuleIdsSet.has(id));
//     const invalidChapterIds = providedChapterIds.filter(id => !validChapterIdsSet.has(id));
//     const invalidLessonIds = providedLessonIds.filter(id => !validLessonIdsSet.has(id));

//     if (invalidModuleIds.length || invalidChapterIds.length || invalidLessonIds.length) {
//       const errors = {};
//       if (invalidModuleIds.length) errors.modules = `Invalid module IDs: ${invalidModuleIds.join(', ')}`;
//       if (invalidChapterIds.length) errors.chapters = `Invalid chapter IDs: ${invalidChapterIds.join(', ')}`;
//       if (invalidLessonIds.length) errors.lessons = `Invalid lesson IDs: ${invalidLessonIds.join(', ')}`;
//       return res.status(400).json({ status: "error", message: "Invalid references provided", errors });
//     }

//     // 5. Update course metadata
//     course.set({ title, description, createdBy, status });
//     await course.save();

//     // 6. Fetch current hierarchy
//     const existingModules = await Module.find({ courseId });
//     const existingModuleMap = Object.fromEntries(existingModules.map(m => [m._id.toString(), m]));

//     const allExistingChapters = await Chapter.find({ moduleId: { $in: existingModules.map(m => m._id) } });
//     const existingChapterMap = Object.fromEntries(allExistingChapters.map(c => [c._id.toString(), c]));

//     const allExistingLessons = await Lesson.find({ chapterId: { $in: allExistingChapters.map(c => c._id) } });
//     const existingLessonMap = Object.fromEntries(allExistingLessons.map(l => [l._id.toString(), l]));

//     const keepModuleIds = [];
//     const keepChapterIds = [];
//     const keepLessonIds = [];

//     // 7. Upsert modules, chapters, and lessons
//     for (const mod of modules) {
//       let moduleDoc;
//       if (mod._id && existingModuleMap[mod._id]) {
//         moduleDoc = existingModuleMap[mod._id];
//         moduleDoc.set({ title: mod.title, orderIndex: mod.orderIndex });
//         await moduleDoc.save();
//       } else {
//         moduleDoc = await Module.create({ courseId, title: mod.title, orderIndex: mod.orderIndex });
//       }
//       keepModuleIds.push(moduleDoc._id.toString());

//       if (mod.chapters) {
//         for (const chap of mod.chapters) {
//           let chapterDoc;
//           if (chap._id && existingChapterMap[chap._id]) {
//             chapterDoc = existingChapterMap[chap._id];
//             chapterDoc.set({ title: chap.title, orderIndex: chap.orderIndex });
//             await chapterDoc.save();
//           } else {
//             chapterDoc = await Chapter.create({ moduleId: moduleDoc._id, title: chap.title, orderIndex: chap.orderIndex });
//           }
//           keepChapterIds.push(chapterDoc._id.toString());

//           if (chap.lessons) {
//             for (const ls of chap.lessons) {
//               let lessonDoc;
//               if (ls._id && existingLessonMap[ls._id]) {
//                 lessonDoc = existingLessonMap[ls._id];
//                 lessonDoc.set({
//                   title: ls.title,
//                   contentType: ls.contentType,
//                   contentURL: ls.contentURL,
//                   duration: ls.duration,
//                   orderIndex: ls.orderIndex,
//                 });
//                 await lessonDoc.save();
//               } else {
//                 lessonDoc = await Lesson.create({
//                   chapterId: chapterDoc._id,
//                   title: ls.title,
//                   contentType: ls.contentType,
//                   contentURL: ls.contentURL,
//                   duration: ls.duration,
//                   orderIndex: ls.orderIndex,
//                 });
//               }
//               keepLessonIds.push(lessonDoc._id.toString());
//             }
//           }
//         }
//       }
//     }

//     // 8. Delete removed items
//     const toDeleteLessons = Object.keys(existingLessonMap).filter(id => !keepLessonIds.includes(id));
//     const toDeleteChapters = Object.keys(existingChapterMap).filter(id => !keepChapterIds.includes(id));
//     const toDeleteModules = Object.keys(existingModuleMap).filter(id => !keepModuleIds.includes(id));

//     await Lesson.deleteMany({ _id: { $in: toDeleteLessons } });
//     await Chapter.deleteMany({ _id: { $in: toDeleteChapters } });
//     await Module.deleteMany({ _id: { $in: toDeleteModules } });

//     // 9. Remove global references (custom function you defined)
//     await removeReferencesGlobally("lessonId", toDeleteLessons);
//     await removeReferencesGlobally("chapterId", toDeleteChapters);
//     await removeReferencesGlobally("moduleId", toDeleteModules);

//     return res.status(200).json({
//       status: "success",
//       message: "Course updated successfully."
//     });

//   } catch (err) {
//     console.error(err);
//     if (err.code === 11000) {
//       const field = Object.keys(err.keyValue).join(', ');
//       return next(new ConflictError(`Duplicate entry for: ${field}`));
//     }
//     next(err);
//   }
// };
  
// const deleteCourseWithHierarchy = async (req, res, next) => {
//     try {
//       const { courseId } = req.params;
  
//       // 1. Validate the course exists
//       const course = await Course.findById(courseId);
//       if (!course) throw new NotFoundError("Course not found.");
  
//       // 2. Fetch module, chapter, and lesson IDs related to this course
//       const modules = await Module.find({ courseId });
//       const moduleIds = modules.map((m) => m._id);
  
//       const chapters = await Chapter.find({ moduleId: { $in: moduleIds } });
//       const chapterIds = chapters.map((c) => c._id);
  
//       const lessons = await Lesson.find({ chapterId: { $in: chapterIds } });
//       const lessonIds = lessons.map((l) => l._id);
  
//       // 3. Delete lessons, chapters, modules, and course
//       await Lesson.deleteMany({ _id: { $in: lessonIds } });
//       await Chapter.deleteMany({ _id: { $in: chapterIds } });
//       await Module.deleteMany({ _id: { $in: moduleIds } });
//       await Course.deleteOne({ _id: courseId });
  
//       // 4. Remove all global references (across collections)
//       await removeReferencesGlobally("lessonId", lessonIds);
//       await removeReferencesGlobally("chapterId", chapterIds);
//       await removeReferencesGlobally("moduleId", moduleIds);
//       await removeReferencesGlobally("courseId", [courseId]);
  
//       // 5. Respond
//       res.status(200).json({ status: "success", message: "Course and all related data deleted successfully." });
  
//     } catch (err) {
//       next(err);
//     }
// };
  
// const getCourseWithHierarchy = async (req, res, next) => {
//   try {
//     const { courseId } = req.params;

//     const course = await Course.findById(courseId).select('-__v -updatedAt');
//     if (!course) throw new NotFoundError("Course not found.");

//     const modules = await Module.find({ courseId }).select('-__v -updatedAt');
//     const moduleIds = modules.map((m) => m._id);

//     const chapters = await Chapter.find({ moduleId: { $in: moduleIds } }).select('-__v -updatedAt');
//     const chapterIds = chapters.map((c) => c._id);

//     const lessons = await Lesson.find({ chapterId: { $in: chapterIds } }).select('-__v -updatedAt');

//     const structured = modules.map((mod) => ({
//       ...mod.toObject(),
//       chapters: chapters
//         .filter((ch) => ch.moduleId.equals(mod._id))
//         .map((ch) => ({
//           ...ch.toObject(),
//           lessons: lessons.filter((ls) => ls.chapterId.equals(ch._id)),
//         })),
//     }));

//     res.json({status:"success",data:{ course, modules: structured }});
//   } catch (err) {
//     next(err);
//   }
// };
 
// const getAllCoursesWithHierarchy = async (req, res, next) => {
//   try {
//     const courses = await Course.find().select('-__v -updatedAt');
//     const allCourseIds = courses.map(c => c._id);

//     const modules = await Module.find({ courseId: { $in: allCourseIds } }).select('-__v -updatedAt');
//     const moduleIds = modules.map(m => m._id);

//     const chapters = await Chapter.find({ moduleId: { $in: moduleIds } }).select('-__v -updatedAt');
//     const chapterIds = chapters.map(c => c._id);

//     const lessons = await Lesson.find({ chapterId: { $in: chapterIds } }).select('-__v -updatedAt');

//     const result = courses.map(course => {
//       const courseModules = modules.filter(m => m.courseId.equals(course._id));
//       const structuredModules = courseModules.map(mod => ({
//         ...mod.toObject(),
//         chapters: chapters
//           .filter(ch => ch.moduleId.equals(mod._id))
//           .map(ch => ({
//             ...ch.toObject(),
//             lessons: lessons.filter(ls => ls.chapterId.equals(ch._id))
//           }))
//       }));

//       return {
//         ...course.toObject(),
//         modules: structuredModules
//       };
//     });

//     res.status(200).json({ status: "success", data: result });
//   } catch (err) {
//     next(err);
//   }
// };

// const getCoursesByUser = async (req, res, next) => {
//   try {
//     const { userId } = req.params;

//     const courses = await Course.find({ createdBy: userId }).select('-__v -updatedAt');
//     if (!courses.length) {
//       throw new NotFoundError("No courses found for this user.");
//     }

//     const courseIds = courses.map(c => c._id);
//     const modules = await Module.find({ courseId: { $in: courseIds } }).select('-__v -updatedAt');
//     const moduleIds = modules.map(m => m._id);

//     const chapters = await Chapter.find({ moduleId: { $in: moduleIds } }).select('-__v -updatedAt');
//     const chapterIds = chapters.map(c => c._id);

//     const lessons = await Lesson.find({ chapterId: { $in: chapterIds } }).select('-__v -updatedAt');

//     const result = courses.map(course => {
//       const courseModules = modules.filter(m => m.courseId.equals(course._id));
//       const structuredModules = courseModules.map(mod => ({
//         ...mod.toObject(),
//         chapters: chapters
//           .filter(ch => ch.moduleId.equals(mod._id))
//           .map(ch => ({
//             ...ch.toObject(),
//             lessons: lessons.filter(ls => ls.chapterId.equals(ch._id))
//           }))
//       }));

//       return {
//         ...course.toObject(),
//         modules: structuredModules
//       };
//     });

//     res.status(200).json({ status: "success", data: result });
//   } catch (err) {
//     next(err);
//   }
// };
  
module.exports = {
  createCourseWithHierarchy,
  updateCourseWithHierarchy,
  deleteCourseWithHierarchy,
  getCourseWithHierarchy,
  getAllCoursesWithHierarchy,
  getCoursesByUser
};
