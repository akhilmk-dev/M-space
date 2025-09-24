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

// Student asking a question
export const askQuestion = catchAsync(async (req, res) => {
  const { question, lessonId,description } = req.body;
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
  const studentId = req.user.id;
  const { lessonId } = req.params;

  // ensure lesson exists
  const lesson = await Lesson.findById(lessonId);
  if (!lesson) throw new NotFoundError("Lesson not found");

  const questions = await QuestionAnswer.find({ studentId, lessonId })
    .populate("lessonId", "title")
    .populate("answeredBy", "name email");

  res.status(200).json({
    status: "success",
    message: "Student questions for the lesson fetched successfully",
    data: questions,
  });
});

// Get all questions for a lesson (for tutor)
export const getLessonQuestions = catchAsync(async (req, res) => {
  const { lessonId } = req.params;

  // ensure lesson exists
  const lesson = await Lesson.findById(lessonId);
  if (!lesson) throw new NotFoundError("Lesson not found");

  const questions = await QuestionAnswer.find({ lessonId })
    .populate("studentId", "name email")
    .populate("answeredBy", "name email");

  res.status(200).json({
    status: "success",
    message: "Lesson questions fetched successfully",
    data: questions,
  });
});
