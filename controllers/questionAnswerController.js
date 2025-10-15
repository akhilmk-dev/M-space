import QuestionAnswer from "../models/QuestionAnswer.js";
import User from "../models/User.js";
import Lesson from "../models/Lesson.js";
import catchAsync from "../utils/catchAsync.js";
import {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
  InternalServerError,
} from "../utils/customErrors.js";
import Module from "../models/Module.js";
import mongoose from "mongoose";
import Student from "../models/Student.js";
import Tutor from "../models/Tutor.js";

// Student asking a question
export const askQuestion = catchAsync(async (req, res) => {
  const { question, lessonId, description, moduleId } = req.body;
  const studentId = req.user.id;

  if (!question || !lessonId) {
    throw new BadRequestError("Question and lessonId are required");
  }

  // Check if user is a student
  const student = await User.findById(studentId).populate("roleId");
  const role = student?.roleId?.role_name?.toLowerCase();

  if (!student || role !== "student") {
    throw new ForbiddenError("Only students can ask questions");
  }

  // Check if lesson exists
  const lesson = await Lesson.findById(lessonId);
  if (!lesson) throw new NotFoundError("Lesson not found");

  // Create question
  const newQuestion = await QuestionAnswer.create({
    studentId,
    question,
    lessonId,
    moduleId,
    description
  });

  res.status(201).json({
    status: "success",
    message: "Question submitted successfully",
    data: newQuestion,
  });
});

// Tutor answering a question
export const answerQuestion = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { answer } = req.body;
  const tutorId = req.user.id;

  if (!answer) {
    throw new BadRequestError("Answer is required");
  }

  // Check if user is a tutor
  const tutor = await User.findById(tutorId).populate("roleId");
  const role = tutor?.roleId?.role_name?.toLowerCase();
  if (!tutor || role !== "tutor") {
    throw new ForbiddenError("Only tutors can answer questions");
  }

  const updatedQuestion = await QuestionAnswer.findByIdAndUpdate(
    id,
    { answer, answeredBy: tutorId },
    { new: true }
  );

  if (!updatedQuestion) throw new NotFoundError("Question not found");

  res.status(200).json({
    status: "success",
    message: "Answer submitted successfully",
    data: updatedQuestion,
  });
});

//  Get all Q&A for a specific student (filtered by lesson)
export const getStudentQuestionsByLesson = catchAsync(async (req, res) => {
  const { lessonId } = req.params;
  const studentId = req.user.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  if (!lessonId || !mongoose.Types.ObjectId.isValid(lessonId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid or missing lessonId",
    });
  }

  // Count total documents for pagination
  const total = await QuestionAnswer.countDocuments({ lessonId, studentId });

  // Fetch questions with pagination
  const questions = await QuestionAnswer.find({ lessonId, studentId }).populate({
    path: "studentId",
    select: "name email",
    populate: { path: "studentProfile", select: "profile_image" },
  })
    .populate("lessonId", "title")
    .populate("answeredBy", "name email")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  // Flatten the data
  const formatted = questions.map((q) => ({
    _id: q._id,
    lesson: q.lessonId?.title || "N/A",
    question: q.question || null,
    description: q.description || null,
    answer: q.answer || "",
    answeredBy: q.answeredBy
      ? {
        name: q.answeredBy.name,
        email: q.answeredBy.email,
      }
      : null,
    student: q.studentId
      ? {
        name: q.studentId.name,
        email: q.studentId.email,
        profile_image: q.studentId.studentProfile?.profile_image || null,
      }
      : null,
    createdAt: q.createdAt,
  }));

  res.status(200).json({
    success: true,
    message: "Lesson questions fetched successfully",
    total,
    totalPages: Math.ceil(total / limit),
    currentPage: page,
    limit,
    data: formatted,
  });
});


// Get all questions for a lesson (for tutor)
export const getLessonQuestions = catchAsync(async (req, res) => {
  const { lessonId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  // Ensure lesson exists
  const lesson = await Lesson.findById(lessonId);
  if (!lesson) throw new NotFoundError("Lesson not found");

  // Count total documents for pagination
  const total = await QuestionAnswer.countDocuments({ lessonId });

  // Fetch questions with pagination
  const questions = await QuestionAnswer.find({ lessonId })
    .populate("studentId", "name email")
    .populate("answeredBy", "name email")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  // Collect unique userIds
  const studentUserIds = questions.map(q => q.studentId?._id).filter(Boolean);
  const tutorUserIds = questions.map(q => q.answeredBy?._id).filter(Boolean);

  // Fetch student and tutor profiles
  const [studentProfiles, tutorProfiles] = await Promise.all([
    Student.find({ userId: { $in: studentUserIds } })
      .select("userId profile_image")
      .lean(),
    Tutor.find({ userId: { $in: tutorUserIds } })
      .select("userId profile_image")
      .lean(),
  ]);

  // Create lookup maps
  const studentImageMap = Object.fromEntries(
    studentProfiles.map(s => [s.userId.toString(), s.profile_image])
  );
  const tutorImageMap = Object.fromEntries(
    tutorProfiles.map(t => [t.userId.toString(), t.profile_image])
  );

  // Merge images into result
  const formatted = questions.map(q => ({
    ...q,
    studentId: q.studentId
      ? {
          ...q.studentId,
          profile_image: studentImageMap[q.studentId._id?.toString()] || null,
        }
      : null,
    answeredBy: q.answeredBy
      ? {
          ...q.answeredBy,
          profile_image: tutorImageMap[q.answeredBy._id?.toString()] || null,
        }
      : null,
  }));

  res.status(200).json({
    status: "success",
    message: "Lesson questions fetched successfully",
    total,
    totalPages: Math.ceil(total / limit),
    currentPage: page,
    limit,
    data: formatted,
  });
});


export const getAllQuestions = catchAsync(async (req, res) => {
  const { page = 1, limit = 10, moduleId, search = "" } = req.query;

  const query = {};

  // Optional filter by moduleId
  if (moduleId) {
    if (!mongoose.Types.ObjectId.isValid(moduleId)) {
      throw new BadRequestError("Invalid moduleId format");
    }

    const moduleExists = await Module.findById(moduleId);
    if (!moduleExists) {
      throw new NotFoundError("Module not found");
    }

    query.moduleId = moduleId;
  }

  // Optional text search (on question or description)
  if (search) {
    query.$or = [
      { question: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }

  const skip = (page - 1) * limit;

  const total = await QuestionAnswer.countDocuments(query);

  const questions = await QuestionAnswer.find(query)
    .populate("lessonId", "title")
    .populate("moduleId", "title")
    .populate("studentId", "name email")
    .populate("answeredBy", "name email")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  res.status(200).json({
    status: "success",
    message: "Questions fetched successfully",
    currentPage: parseInt(page),
    totalPages: Math.ceil(total / limit),
    totalRecords: total,
    data: questions,
  });
});

