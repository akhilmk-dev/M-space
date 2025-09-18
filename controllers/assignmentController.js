const Assignment = require("../models/Assignment");
const AssignmentSubmission = require("../models/AssignmentSubmission");
const User = require("../models/User");
const Role = require("../models/Roles");
const { uploadBase64ToS3 } = require("../utils/s3Uploader");
const { BadRequestError, NotFoundError, ForbiddenError, InternalServerError } = require("../utils/customErrors");
const mongoose = require("mongoose");
const Course = require("../models/Course");
const calculateBase64FileSize = require("../helper/calculateBase64FileSize");
const Student = require("../models/Student");
const { deleteFileFromS3 } = require("../utils/deleteFileFromS3");


// === Util: Upload all files and format
// const processAssignmentFiles = async (files = []) => {
//     const uploaded = [];

//     for (const file of files) {
//         const { base64, name } = file;
//         if (!base64 || !name) continue;

//         const fileUrl = await uploadBase64ToS3(base64, name, "assignments");
//         const size = calculateBase64FileSize(base64);

//         uploaded.push({ name, fileUrl, size });
//     }

//     return uploaded;
// };

const processAssignmentFiles = async (files = [],existingFiles=[]) => {
  const uploaded = [];

  for (const file of files) {
    const { base64, name } = file;
    if (!base64 || !name) continue;

    // Case 1: Already uploaded file (URL passed inside base64)
    if (base64.startsWith("http")) {
      const existingFile = existingFiles.find(f => f.fileUrl == base64);
      uploaded.push({
        name,
        fileUrl: base64,
        size: existingFile ? existingFile.size : null, 
      });
    } 
    // Case 2: New file (real base64, needs upload)
    else {
      const fileUrl = await uploadBase64ToS3(base64, name, "assignments");
      const size = calculateBase64FileSize(base64);

      uploaded.push({ name, fileUrl, size });
    }
  }

  return uploaded;
};

// === Controller: Create Assignment
const createAssignment = async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const {
            title,
            description,
            courseId,
            lessonId ,
            deadline,
            files = [],
            assignedTo = [],
            status = 'Active',
        } = req.body;

        const createdBy = req.user?.id || req.body.createdBy;
        const user = await User.findById(req.user.id)?.populate('roleId');
        if(user?.roleId?.role_name?.toLowerCase() == "student"){
            throw new ForbiddenError("Only Admin and tutor can create the Assignment")
        }
        if (!title || !createdBy) throw new BadRequestError("Title and createdBy are required.");

        // 1. Get student list if assignedTo is empty or contains 'all'
        let studentIds = assignedTo;
        if (assignedTo.length === 0 || assignedTo.includes('all')) {
            const validCourse = await Course.findById(courseId).session(session);
            if (!validCourse) throw new BadRequestError("Invalid courseId provided.");
            // Step 1: Get user IDs of students in this course
            const allUsers = await User.find()
                .populate('roleId') 
                .session(session)

            const studentUsers = allUsers.filter(user => user.roleId?.role_name == 'Student');
            const studentUserIds = studentUsers.map(u => u._id);
            // Step 2: Get matching student records
            const enrolledStudents = await Student.find({
                userId: { $in: studentUserIds },
                courseId: courseId
            }).session(session);
            studentIds = enrolledStudents.map(s => s.userId);
        }

        if (studentIds?.length == 0) return res.status(404).json({ status: "error", message: "No students registered in this course" });

        // 2. Upload files to S3 and calculate size
        const processedFiles = await processAssignmentFiles(files);

        // 3. Create Assignment
        const [assignment] = await Assignment.create(
            [{
                title,
                description,
                lessonId,
                deadline,
                files: processedFiles,
                assignedTo: studentIds,
                status,
                createdBy,
            }],
            { session }
        );

        // 4. Create AssignmentSubmissions per student
        const submissions = studentIds.map(studentId => ({
            assignmentId: assignment._id,
            studentId,
            lessonId,
            status: 'pending',
        }));

        await AssignmentSubmission.insertMany(submissions, { session });

        // 5. Commit
        await session.commitTransaction();
        session.endSession();

        res.status(201).json({
            message: "Assignment created successfully.",
            assignment,
        });

    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        next(err);
    }
};

const getAllAssignments = async (req, res, next) => {
    try {
        const { courseId, lessonId } = req.query;

        const filter = {};
        if (courseId) filter.courseId = courseId;
        if (lessonId) filter.lessonId = lessonId;

        const assignments = await Assignment.find(filter)
            .populate("createdBy", "name email")
            .sort({ createdAt: -1 }).select('-assignedTo -files');

        res.status(200).json({
            status: "success",
            data: assignments,
        });
    } catch (err) {
        next(err);
    }
};

const getAssignmentById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // 1. Get the assignment
    const assignment = await Assignment.findById(id)
      .populate("createdBy", "name email")
      .populate("assignedTo", "name email");

    if (!assignment) {
      return res.status(404).json({
        status: "error",
        message: "Assignment not found",
      });
    }

    // 2. Get submissions — ONLY populate lessonId
    const submissions = await AssignmentSubmission.find({ assignmentId: id })
      .populate({
        path: "lessonId",
        select: "title chapterId", // keep chapterId for courseId trace
        populate: {
          path: "chapterId",
          select: "moduleId",
          populate: {
            path: "moduleId",
            select: "courseId",
            populate: {
              path: "courseId",
              select: "_id"
            }
          }
        }
      })
      .sort({ createdAt: -1 });

    // 3. Extract courseId from first submission
    const firstSubmission = submissions[0];
    const courseId =
      firstSubmission?.lessonId?.chapterId?.moduleId?.courseId?._id || null;

    // 4. Strip submissions to only keep lessonId
    const strippedSubmissions = submissions.map(sub => ({
      _id: sub._id,
      userId:sub.studentId,
      assignmentId: sub.assignmentId,
      lessonId: sub.lessonId?._id,
      createdAt: sub.createdAt,
      updatedAt: sub.updatedAt
    }));

    // 5. Return response
    res.status(200).json({
      status: "success",
      assignment,
      courseId,
      submissions: strippedSubmissions
    });

  } catch (err) {
    next(err);
  }
};

const getAssignmentsByCreatedBy = async (req, res, next) => {
    try {
        const { id } = req.params; // user ID of creator
        const { status } = req.query; // optional status filter

        // 1. Build the query object
        const filter = { createdBy:id };

        // Optional: validate and apply status filter
        const allowedStatuses = ["Active", "Closed"];
        if (status) {
            if (!allowedStatuses.includes(status)) {
                return res.status(400).json({
                    status: "error",
                    message: `Invalid status value. Allowed values: ${allowedStatuses.join(", ")}`,
                });
            }
            filter.status = status;
        }

        // 2. Fetch assignments by createdBy (with optional status)
        const assignments = await Assignment.find(filter)
            .populate("createdBy", "name email")
            .populate("assignedTo", "name email")
            .sort({ createdAt: -1 });

        res.status(200).json({
            status: "success",
            count: assignments.length,
            assignments,
        });
    } catch (err) {
        next(err);
    }
};

const updateAssignment = async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();
  
    try {
      const assignmentId = req.params.assignmentId;
      const {
        title,
        description,
        courseId,
        lessonId,
        deadline,
        files = [],
        assignedTo = [],
        status,
      } = req.body;
  
      const updatedBy = req.user?.id || req.body.updatedBy;
  
      // 1. Check if assignment exists
      const assignment = await Assignment.findById(assignmentId).session(session);
      if (!assignment) {
        throw new NotFoundError("Assignment not found.");
      }
  
      // 2. Determine assigned students (all or specific)
      let newStudentIds = assignedTo;
  
      if (assignedTo.length === 0 || assignedTo.includes("all")) {
        const validCourse = await Course.findById(courseId).session(session);
        if (!validCourse) throw new BadRequestError("Invalid courseId provided.");
  
        const allUsers = await User.find().populate("roleId").session(session);
        const studentUsers = allUsers.filter(
          (user) => user.roleId?.role_name === "Student"
        );
        const studentUserIds = studentUsers.map((u) => u._id);
  
        const enrolledStudents = await Student.find({
          userId: { $in: studentUserIds },
          courseId: courseId,
        }).session(session);
  
        newStudentIds = enrolledStudents.map((s) => s.userId);
      }
  
      if (newStudentIds.length === 0) {
        throw new BadRequestError("No valid students assigned to this assignment.");
      }
  
      // 3. Process new files if provided
      const processedFiles = await processAssignmentFiles(files,assignment?.files);
  
      // 4. Update assignment
      assignment.title = title || assignment.title;
      assignment.description = description || assignment.description;
      assignment.courseId = courseId || assignment.courseId;
      assignment.lessonId = lessonId || assignment.lessonId;
      assignment.deadline = deadline || assignment.deadline;
      if (processedFiles.length > 0) assignment.files = processedFiles;
      assignment.assignedTo = newStudentIds;
      assignment.status = "Active" || assignment.status;
  
      await assignment.save({ session });
  
      // 5. Sync submissions
      const existingSubmissions = await AssignmentSubmission.find({
        assignmentId: assignment._id,
      }).session(session);
  
      const existingStudentIds = existingSubmissions.map((s) =>
        s.studentId.toString()
      );
      const newStudentIdStrings = newStudentIds.map((id) => id.toString());
  
      // 5a. Find students to remove submissions for
      const studentsToRemove = existingStudentIds.filter(
        (id) => !newStudentIdStrings.includes(id)
      );
  
      // 5b. Find students to add submissions for
      const studentsToAdd = newStudentIdStrings.filter(
        (id) => !existingStudentIds.includes(id)
      );
  
      // 6. Remove submissions
      if (studentsToRemove.length > 0) {
        await AssignmentSubmission.deleteMany({
          assignmentId: assignment._id,
          studentId: { $in: studentsToRemove },
        }).session(session);
      }
  
      // 7. Add new submissions
      if (studentsToAdd.length > 0) {
        const newSubmissions = studentsToAdd.map((studentId) => ({
          assignmentId: assignment._id,
          studentId,
          lessonId: assignment.lessonId,
          status: "pending",
        }));
  
        await AssignmentSubmission.insertMany(newSubmissions, { session });
      }
  
      await session.commitTransaction();
      session.endSession();
  
      res.status(200).json({
        message: "Assignment updated successfully.",
        assignment,
      });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      next(err);
    }
};

const deleteAssignment = async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();
  
    try {
      const { assignmentId } = req.params;
  
      if (!assignmentId) {
        throw new BadRequestError("Assignment ID is required.");
      }

      const user = await User.findById(req.user.id).populate('roleId');

      if(user?.roleId?.role_name?.toLowerCase() == "student"){
        throw new InternalServerError("Only Admin and tutor can delete the assignment")
      }
  
      // 1. Find the assignment
      const assignment = await Assignment.findById(assignmentId).session(session);
      if (!assignment) {
        throw new NotFoundError("Assignment not found.");
      }
  
      // 2. Delete assignment files from S3
      for (const file of assignment.files || []) {
        if (file.fileUrl) {
          await deleteFileFromS3(file.fileUrl); // Delete from S3
        }
      }
  
      // 3. Get all related submissions
      const submissions = await AssignmentSubmission.find({ assignmentId }).session(session);
  
      // 4. Delete submission files from S3
      for (const submission of submissions) {
        for (const file of submission.submissionFiles || []) {
          if (file.fileUrl) {
            await deleteFileFromS3(file.fileUrl); // Delete from S3
          }
        }
      }
  
      // 5. Delete submissions from DB
      await AssignmentSubmission.deleteMany({ assignmentId }).session(session);
  
      // 6. Delete assignment from DB
      await Assignment.deleteOne({ _id: assignmentId }).session(session);
  
      // 7. Commit transaction
      await session.commitTransaction();
      session.endSession();
  
      res.status(200).json({
        status:"success",
        message: "Assignment  deleted successfully.",
      });
  
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      next(err);
    }
};

module.exports = {
    createAssignment,
    getAllAssignments,
    getAssignmentById,
    getAssignmentsByCreatedBy,
    updateAssignment,
    deleteAssignment
};
