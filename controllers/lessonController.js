const mongoose = require('mongoose');
const Lesson = require('../models/Lesson');
const Chapter = require('../models/Chapter');
const Module = require('../models/Module');
const Course = require('../models/Course');
const { NotFoundError,ConflictError, ForbiddenError } = require('../utils/customErrors');
const removeReferencesGlobally = require('../helper/removeReferencesGlobally'); 
const User = require('../models/User');


exports.createLessons = async (req, res) => {
  try {

    const { courseId, moduleId, chapterId, lessons } = req.body;

    // Check if Course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(400).json({ success: false, message: "Invalid Course ID" });
    }

    // Check if Module exists & belongs to the course
    const module = await Module.findOne({ _id: moduleId, courseId });
    if (!module) {
      return res.status(400).json({ success: false, message: "Invalid Module ID" });
    }

    // Check if Chapter exists & belongs to the module
    const chapter = await Chapter.findOne({ _id: chapterId, moduleId });
    if (!chapter) {
      return res.status(400).json({ success: false, message: "Invalid Chapter ID" });
    }

    //  Add multiple lessons
    const lessonDocs = lessons.map((lesson) => ({
      ...lesson,
      chapterId,
    }));

    const savedLessons = await Lesson.insertMany(lessonDocs);

    return res.status(201).json({
      success: true,
      message: "Lessons added successfully",
      data: savedLessons,
    });
  } catch (err) {
    console.error("Error adding lessons:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

exports.updateSingleLesson = async (req, res,next) => {
  try {
    const { lessonId } = req.params
    const user = await User.findById(req.user.id).populate('roleId');
    if(user?.roleId?.role_name == "Student"){
      throw new ForbiddenError("Student can't update the lesson");
    }
    const data = {
      createdBy:req.user.id,
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

exports.deleteLesson = async (req, res, next) => {
    try {
      const { lessonId } = req.params;
  
      if (!mongoose.Types.ObjectId.isValid(lessonId)) {
        throw new NotFoundError('Invalid lesson ID');
      }
  
      const lesson = await Lesson.findByIdAndDelete(lessonId);
      if (!lesson) {
        throw new NotFoundError('Lesson not found');
      }
  
      // 🔥 Remove references from other collections
      await removeReferencesGlobally(lessonId);
  
      res.status(200).json({
        status: 'success',
        message: 'Lesson deleted and references removed successfully',
      });
    } catch (err) {
      next(err);
    }
  };

exports.getLessonById = async (req, res, next) => {
try {
    const { lessonId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(lessonId)) {
    throw new NotFoundError('Invalid lesson ID');
    }

    const lesson = await Lesson.findById(lessonId).select('-__v -updatedAt');

    if (!lesson) {
    throw new NotFoundError('Lesson not found');
    }

    res.status(200).json({
    status: 'success',
    data: lesson,
    });
} catch (err) {
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

  

