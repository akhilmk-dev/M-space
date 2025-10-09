const AssignmentSubmission = require("../models/AssignmentSubmission");
const Assignment = require("../models/Assignment");
const User = require("../models/User");
const { NotFoundError, BadRequestError } = require("../utils/customErrors");
const { uploadBase64ToS3 } = require("../utils/s3Uploader");
const calculateBase64FileSize = require("../helper/calculateBase64FileSize");

const submitAssignment = async (req, res, next) => {
    try {
      const { id: studentId } = req.user; 
      const { assignmentId } = req.params;
  
      const { answer, submissionLink, submissionFiles = [] } = req.body;
  
      if (!assignmentId) {
        throw new BadRequestError("Assignment ID is required.");
      }
  
      const submission = await AssignmentSubmission.findOne({
        _id:assignmentId,
        studentId,
      });
  
      if (!submission) {
        throw new NotFoundError("Assignment submission not found for this student.");
      }
  
      // Prevent resubmission if already submitted
      if (submission.status === 'submitted' || submission.status === 'reviewed') {
        throw new BadRequestError("You have already submitted this assignment.");
      }
  
      // Upload files and calculate size
      const uploadedFiles = [];
  
      for (const file of submissionFiles) {
        const { name, base64 } = file;
  
        if (!name || !base64) continue;
  
        const fileUrl = await uploadBase64ToS3(base64, name, "submissions");
        const size = calculateBase64FileSize(base64);
  
        uploadedFiles.push({ name, fileUrl, size });
      }
  
      // Update submission record
      submission.answer = answer || '';
      submission.submissionLink = submissionLink || '';
      submission.submissionFiles = uploadedFiles;
      submission.status = 'submitted';
      submission.submittedAt = Date.now()
  
      await submission.save();
  
      res.status(200).json({
        message: "Assignment submitted successfully.",
        submission,
      });
  
    } catch (err) {
      next(err);
    }
};

const reviewAssignment = async (req, res, next) => {
    try {
      const { assignmentId } = req.params;
      const { mark, comment } = req.body;
  
      if (!assignmentId) {
        throw new BadRequestError("Assignment ID is required.");
      }

      // Find the submission
      const submission = await AssignmentSubmission.findById(assignmentId);
      if (!submission) {
        throw new NotFoundError("Assignment submission not found.");
      }
  
      if (submission.status !== "submitted") {
        throw new BadRequestError("Only submitted assignments can be reviewed.");
      }
  
      // Update the submission with mark and comment
      submission.marks = mark;
      submission.comment = comment || "";
      submission.status = "reviewed";
      submission.reviewedAt = Date.now();
  
      await submission.save();
  
      res.status(200).json({
        message: "Assignment reviewed successfully.",
        submission,
      });
    } catch (err) {
      next(err);
    }
};

const getSubmissionsByStudent = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const { status, page = 1, limit = 10 } = req.query;

    if (!studentId) {
      throw new BadRequestError("Student ID is required.");
    }

    // Build filter
    const filter = { studentId };
    if (status) {
      filter.status = status;
    }

    // Convert pagination params
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.max(1, parseInt(limit));
    const skip = (pageNum - 1) * limitNum;

    // Count total submissions for pagination metadata
    const totalSubmissions = await AssignmentSubmission.countDocuments(filter);

    // Fetch paginated submissions
    const submissions = await AssignmentSubmission.find(filter)
      .populate("assignmentId", "title deadline description")
      .populate("studentId", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    res.status(200).json({
      message: "Submissions fetched successfully.",
      count: submissions.length,
      data: submissions,
      totalSubmissions,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(totalSubmissions / limitNum),
    });
  } catch (err) {
    next(err);
  }
};

const getSubmissionById = async (req, res, next) => {
    try {
        const { submissionId } = req.params;

        const submission = await AssignmentSubmission.findById(submissionId)
            .populate("assignmentId","title description lessonId deadline files")
            .populate("studentId", "name email");

        if (!submission) {
            return res.status(404).json({
                message: "Submission not found",
            });
        }

        res.status(200).json({
            message: "Submission fetched successfully.",
            data: submission,
        });
    } catch (err) {
        next(err);
    }
};

const getAllSubmissions = async (req, res, next) => {
    try {
        const submissions = await AssignmentSubmission.find()
            .populate("assignmentId", "title deadline")
            .populate("studentId", "name email")
            .sort({ createdAt: -1 });

        res.status(200).json({
            message: "All submissions fetched successfully.",
            count: submissions.length,
            data: submissions,
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    getAllSubmissions,
    getSubmissionsByStudent,
    submitAssignment,
    getSubmissionById,
    reviewAssignment
}