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

const processAssignmentFiles = async (files = [], existingFiles = []) => {
  const uploaded = [];

  for (const file of files) {
    const { base64, name } = file;
    if (!base64 || !name) continue;

    // Already uploaded file (URL passed inside base64)
    if (base64.startsWith("http")) {
      const existingFile = existingFiles.find(f => f.fileUrl == base64);
      uploaded.push({
        name,
        fileUrl: base64,
        size: existingFile ? existingFile.size : null,
      });
    }
    //  New file (real base64, needs upload)
    else {
      const fileUrl = await uploadBase64ToS3(base64, name, "assignments");
      const size = calculateBase64FileSize(base64);

      uploaded.push({ name, fileUrl, size });
    }
  }

  return uploaded;
};

//  Controller: Create Assignment
const createAssignment = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      title,
      description,
      courseId,
      lessonId,
      deadline,
      files = [],
      assignedTo = [],
      status = 'Active',
    } = req.body;

    const createdBy = req.user?.id || req.body.createdBy;
    const user = await User.findById(req.user.id)?.populate('roleId');
    if (user?.roleId?.role_name?.toLowerCase() == "student") {
      throw new ForbiddenError("Only Admin and tutor can create the Assignment")
    }
    if (!title || !createdBy) throw new BadRequestError("Title and createdBy are required.");

    // Get student list if assignedTo is empty or contains 'all'
    let studentIds = assignedTo;
    if (assignedTo.length === 0 || assignedTo.includes('all')) {
      const validCourse = await Course.findById(courseId).session(session);
      if (!validCourse) throw new BadRequestError("Invalid courseId provided.");
      //  Get user IDs of students in this course
      const allUsers = await User.find()
        .populate('roleId')
        .session(session)

      const studentUsers = allUsers.filter(user => user.roleId?.role_name == 'Student');
      const studentUserIds = studentUsers.map(u => u._id);
      // Get matching student records
      const enrolledStudents = await Student.find({
        userId: { $in: studentUserIds },
        courseId: courseId
      }).session(session);
      studentIds = enrolledStudents.map(s => s.userId);
    }

    if (studentIds?.length == 0) return res.status(404).json({ status: "error", message: "No students registered in this course" });

    // Upload files to S3 and calculate size
    const processedFiles = await processAssignmentFiles(files);

    // Create Assignment
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

    // Create AssignmentSubmissions per student
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
    let {
      page = 1,
      limit = 10,
      sortBy = "createdAt:desc",
      search = "",
      courseId,
      createdBy, 
    } = req.query;

    // Pagination setup
    page = parseInt(page);
    limit = parseInt(limit);
    const skip = (page - 1) * limit;

    // Sort parsing (attendance-style)
    let [sortField, sortOrder] = sortBy.split(":");
    sortField = sortField || "createdAt";
    sortOrder = sortOrder === "asc" ? 1 : -1;

    // === Filter setup ===
    const filter = {};

    // Filter by course
    if (courseId && mongoose.Types.ObjectId.isValid(courseId)) {
      filter.courseId = new mongoose.Types.ObjectId(courseId);
    }

    // Filter by createdBy (either ObjectId or string search)
    if (createdBy) {
      if (mongoose.Types.ObjectId.isValid(createdBy)) {
        // Direct ObjectId match
        filter.createdBy = new mongoose.Types.ObjectId(createdBy);
      } else {
        // Search by user name or email
        const matchingUsers = await User.find({
          $or: [
            { name: { $regex: createdBy, $options: "i" } },
            { email: { $regex: createdBy, $options: "i" } },
          ],
        }).select("_id");

        const userIds = matchingUsers.map(u => u._id);
        if (userIds.length > 0) {
          filter.createdBy = { $in: userIds };
        } else {
          // No matching users → return empty result
          return res.status(200).json({
            status: "success",
            total: 0,
            totalPages: 0,
            currentPage: page,
            limit,
            data: [],
          });
        }
      }
    }

    // Search by assignment title or description
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    // === Fetch data ===
    const [assignments, total] = await Promise.all([
      Assignment.find(filter)
        .populate("createdBy", "name email")
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(limit)
        .select("-assignedTo -files"),
      Assignment.countDocuments(filter),
    ]);

    res.status(200).json({
      status: "success",
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      limit,
      data: assignments,
    });
  } catch (err) {
    next(err);
  }
};

const getAssignmentById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      page = 1,
      limit = 10,
      status,
      search = "",
      lessonId,
    } = req.query;

    // Get the assignment
    const assignment = await Assignment.findById(id)
      .populate("createdBy", "name email")
      .populate("assignedTo", "name email");

    if (!assignment) {
      return res.status(404).json({
        status: "error",
        message: "Assignment not found",
      });
    }

    // 🔹 Build filter query for submissions
    const filter = { assignmentId: id };

    if (status) filter.status = status;
    if (lessonId) filter.lessonId = lessonId;

    // We'll handle student name search after populating (since it's in User)
    const skip = (page - 1) * limit;

    // Get submissions
    let submissions = await AssignmentSubmission.find(filter)
      .populate({
        path: "lessonId",
        select: "title chapterId",
        populate: {
          path: "chapterId",
          select: "moduleId",
          populate: {
            path: "moduleId",
            select: "courseId",
            populate: {
              path: "courseId",
              select: "_id",
            },
          },
        },
      })
      .populate({
        path: "studentId",
        select: "name email",
      })
      .sort({ createdAt: -1 })
      .lean();

    // Optional: Filter by student name (search)
    if (search) {
      const searchRegex = new RegExp(search, "i");
      submissions = submissions.filter((sub) =>
        searchRegex.test(sub.studentId?.name || "")
      );
    }

    const totalSubmissions = submissions.length;
    const paginatedSubmissions = submissions.slice(skip, skip + parseInt(limit));

    // Extract courseId from first submission
    const firstSubmission = submissions[0];
    const courseId =
      firstSubmission?.lessonId?.chapterId?.moduleId?.courseId?._id || null;

    // Clean submissions for response
    const formattedSubmissions = paginatedSubmissions.map((sub) => ({
      _id: sub._id,
      submittedAt: sub.submittedAt || "",
      reviewedAt: sub.reviewedAt || "",
      userId: sub.studentId?._id,
      studentName: sub.studentId?.name || null,
      email: sub.studentId?.email || null,
      assignmentId: sub.assignmentId,
      lessonId: sub.lessonId?._id,
      lessonTitle: sub.lessonId?.title || "",
      status: sub.status,
      marks: sub.marks,
      comment: sub.comment,
      createdAt: sub.createdAt,
      updatedAt: sub.updatedAt,
    }));

    // Response
    res.status(200).json({
      status: "success",
      message: "Assignment fetched successfully",
      assignment,
      courseId,
      total: totalSubmissions,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(totalSubmissions / limit),
      submissions: formattedSubmissions,
    });
  } catch (err) {
    next(err);
  }
};

const getAssignmentsByCreatedBy = async (req, res, next) => {
  try {
    const { id } = req.params; // user ID of creator
    const { status, page = 1, limit = 10 } = req.query; // pagination

    // 1. Validate user ID
    if (!id) {
      return res.status(400).json({ status: "error", message: "Creator ID is required" });
    }

    // 2. Build the query object
    const filter = { createdBy: id };

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

    // 3. Convert pagination params
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.max(1, parseInt(limit));
    const skip = (pageNum - 1) * limitNum;

    // 4. Count total assignments for pagination metadata
    const totalAssignments = await Assignment.countDocuments(filter);

    // 5. Fetch paginated assignments
    const assignments = await Assignment.find(filter)
      .populate("createdBy", "name email")
      .populate("assignedTo", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    // 6. Send response with pagination info
    res.status(200).json({
      status: "success",
      count: assignments.length,
      data: assignments,
      totalAssignments,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(totalAssignments / limitNum),
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

    // Check if assignment exists
    const assignment = await Assignment.findById(assignmentId).session(session);
    if (!assignment) {
      throw new NotFoundError("Assignment not found.");
    }

    //  Handle assigned students
    let newStudentIds = assignedTo;
    if (assignedTo.length === 0 || assignedTo.includes("all")) {
      const validCourse = await Course.findById(courseId).session(session);
      if (!validCourse) throw new BadRequestError("Invalid courseId provided.");

      const studentUsers = await User.find()
        .populate("roleId")
        .session(session)
        .then((users) => users.filter((u) => u.roleId?.role_name === "Student"));

      const studentUserIds = studentUsers.map((u) => u._id);

      const enrolledStudents = await Student.find({
        userId: { $in: studentUserIds },
        courseId,
      }).session(session);

      newStudentIds = enrolledStudents.map((s) => s.userId);
    }

    if (newStudentIds.length === 0) {
      throw new BadRequestError("No valid students assigned to this assignment.");
    }

    //  Process files safely
    const processedFiles = await processAssignmentFiles(files, assignment.files);

    //  Update directly using updateOne (safer inside transaction)
    const updatedAssignment = await Assignment.findByIdAndUpdate(
      assignmentId,
      {
        $set: {
          title: title ?? assignment.title,
          description: description ?? assignment.description,
          courseId: courseId ?? assignment.courseId,
          lessonId: lessonId ?? assignment.lessonId,
          deadline: deadline ?? assignment.deadline,
          files: processedFiles.length > 0 ? processedFiles : assignment.files,
          assignedTo: newStudentIds,
          status: status ?? assignment.status,
          updatedBy,
        },
      },
      { new: true, session }
    );

    //  Sync submissions
    const existingSubmissions = await AssignmentSubmission.find({
      assignmentId: updatedAssignment._id,
    }).session(session);

    const existingStudentIds = existingSubmissions.map((s) => s.studentId.toString());
    const newStudentIdStrings = newStudentIds.map((id) => id.toString());

    const studentsToRemove = existingStudentIds.filter(
      (id) => !newStudentIdStrings.includes(id)
    );
    const studentsToAdd = newStudentIdStrings.filter(
      (id) => !existingStudentIds.includes(id)
    );

    if (studentsToRemove.length > 0) {
      await AssignmentSubmission.deleteMany({
        assignmentId: updatedAssignment._id,
        studentId: { $in: studentsToRemove },
      }).session(session);
    }

    if (studentsToAdd.length > 0) {
      const newSubmissions = studentsToAdd.map((studentId) => ({
        assignmentId: updatedAssignment._id,
        studentId,
        lessonId: updatedAssignment.lessonId,
        status: "pending",
      }));

      await AssignmentSubmission.insertMany(newSubmissions, { session });
    }

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      message: "Assignment updated successfully.",
      assignment: updatedAssignment,
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

    if (user?.roleId?.role_name?.toLowerCase() == "student") {
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
      status: "success",
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
