const mongoose = require('mongoose');
const User = require('../models/User');
const Course = require('../models/Course');
const Student = require('../models/Student');
const { BadRequestError, NotFoundError, ConflictError, UnAuthorizedError, InternalServerError, ForbiddenError } = require('../utils/customErrors'); // adjust your error classes
const Roles = require('../models/Roles');
const bcrypt = require("bcrypt");
const checkDependencies = require('../helper/checkDependencies');
const Tutor = require('../models/Tutor');
const AssignmentSubmission = require('../models/AssignmentSubmission');
const { uploadBase64ToS3 } = require('../utils/s3Uploader');
const hasPermission = require('../helper/hasPermission');
const Attendance = require('../models/Attendance');
const sendBrevoEmail = require('../utils/sendBrevoEmail');

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Create only student (you already have)
const createStudent = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const isPermission = await hasPermission(req.user?.id, "Add Student");
    if (!isPermission) {
      throw new ForbiddenError("User Doesn't have permission to create student")
    }
    const { name, email, phone, password, courseId, profile_image, status, mode } = req.body;
    if (!name || !email || !phone || !password || !courseId) {
      throw new BadRequestError("All fields are required");
    }

    // check if user exists
    const existingUser = await User.findOne({ email }).session(session);
    if (existingUser) {
      throw new ConflictError("Email already in use.");
    }

    // find student role
    const studentRole = await Roles.findOne({ role_name: /student/i }).session(session);
    if (!studentRole) {
      throw new NotFoundError("Student role not found.");
    }

    // validate course
    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      throw new BadRequestError("Invalid Course ID.");
    }
    const course = await Course.findById(courseId).session(session);
    if (!course) {
      throw new NotFoundError("Course not found.");
    }

    // hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // upload profile image if provided
    let profileImageUrl = null;
    if (profile_image) {
      try {
        profileImageUrl = await uploadBase64ToS3(profile_image, "student-profiles");
      } catch (err) {
        throw new BadRequestError("Error uploading profile image to S3: " + err.message);
      }
    }

    // create user
    const userDocs = await User.create(
      [{
        name,
        email,
        phone,
        passwordHash,
        roleId: studentRole._id,
        status: status ,
      }],
      { session }
    );
    const user = userDocs[0];

    // create student record
    const student = await Student.create(
      [{
        userId: user._id,
        courseId,
        enrollmentDate: new Date(),
        profile_image: profileImageUrl,
        status: true,
        mode: mode
      }],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      message: "Student created successfully.",
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        status: user.status,
        profileImage: student[0].profile_image,
        course: {
          id: course._id,
          title: course.title,
        },
      }
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

// List students with pagination, search & optional course filter (fixed pagination)
async function listStudents(req, res, next) {
  try {
    const isPermission = await hasPermission(req.user?.id, "List Student");
    if (!isPermission) {
      throw new ForbiddenError("User Doesn't have permission to list student");
    }

    // Pagination
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 10);
    const skip = (page - 1) * limit;

    // Search & Sort
    const search = req.query.search || "";
    const searchRegex = new RegExp(search, "i");
    const { courseId } = req.query;

    let sortField = "createdAt";
    let sortOrder = -1;
    if (req.query.sortBy) {
      const [field, order] = req.query.sortBy.split(":");
      sortField = field || "createdAt";
      sortOrder = order === "asc" ? 1 : -1;
    }

    // Find student role
    const studentRole = await Roles.findOne({ role_name: /student/i });
    if (!studentRole) throw new NotFoundError("Student role not found.");

    // Build base user match (role + search)
    const userMatch = {
      roleId: studentRole._id,
      $or: [
        { name: { $regex: searchRegex } },
        { email: { $regex: searchRegex } },
        { phone: { $regex: searchRegex } },
      ],
    };

    // If courseId provided -> fetch all student userIds for that course and use them to filter users
    let filteredUserIds = null;
    if (courseId) {
      if (!mongoose.Types.ObjectId.isValid(courseId)) {
        throw new BadRequestError("Invalid courseId");
      }
      const studentRecords = await Student.find({ courseId }).select("userId").lean();
      filteredUserIds = studentRecords.map(s => s.userId.toString());

      // if no students in that course, return empty with correct pagination metadata
      if (filteredUserIds.length === 0) {
        return res.json({
          status: "success",
          data: [],
          total: 0,
          page,
          limit,
          totalPages: 0,
        });
      }

      // restrict users to those ids
      userMatch._id = { $in: filteredUserIds };
    }

    // Count total (respects courseId when provided)
    const total = await User.countDocuments(userMatch);

    // Fetch paginated users
    const users = await User.find(userMatch)
      .populate("roleId", "role_name")
      .sort({ [sortField]: sortOrder })
      .collation({ locale: "en", strength: 2 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Now join Student info for these users in one go (avoid N DB calls)
    const userIds = users.map(u => u._id);
    const studentMap = {};
    if (userIds.length > 0) {
      const studentDocs = await Student.find({ userId: { $in: userIds } })
        .select("userId courseId enrollmentDate profile_image mode")
        .lean();
      studentDocs.forEach(sd => {
        studentMap[sd.userId.toString()] = sd;
      });
    }

    // Pre-fetch course titles for used courseIds to reduce queries
    const courseIdSet = new Set();
    Object.values(studentMap).forEach(s => {
      if (s && s.courseId) courseIdSet.add(s.courseId.toString());
    });
    const courseIdsToFetch = Array.from(courseIdSet);
    const courseMap = {};
    if (courseIdsToFetch.length > 0) {
      const courseDocs = await Course.find({ _id: { $in: courseIdsToFetch } }).select("title").lean();
      courseDocs.forEach(c => {
        courseMap[c._id.toString()] = c;
      });
    }

    // Build response array
    const students = users.map(u => {
      const s = studentMap[u._id.toString()];
      if (courseId && !s) return null;
      const course = s ? courseMap[s.courseId?.toString()] : null;
      return {
        id: u._id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        status: u.status,
        role: u.roleId?.role_name || null,
        mode: s?.mode || null,
        course: course ? { id: course._id, title: course.title } : null,
        enrollmentDate: s?.enrollmentDate || null,
        profile_image: s?.profile_image || null,
      };
    }).filter(Boolean);

    res.json({
      status: "success",
      data: students,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    next(err);
  }
}

// Update student
async function updateStudent(req, res, next) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const isPermission = await hasPermission(req.user?.id, "Edit Student");
    if (!isPermission) {
      throw new ForbiddenError("User Doesn't have permission to edit student")
    }
    const { studentId } = req.params; // ID of student user
    const { name, email, phone, courseId, profile_image, status = true, mode } = req.body;

    // Validate student ID
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      throw new BadRequestError("Invalid student ID");
    }

    const user = await User.findById(studentId).session(session);
    if (!user) {
      throw new NotFoundError("User not found");
    }

    // Check role is student
    const role = await Roles.findById(user.roleId).session(session);
    if (!role || !/student/i.test(role.role_name)) {
      throw new BadRequestError("User is not a student");
    }

    // Validate and fetch course if provided
    let course = null;
    if (courseId) {
      if (!mongoose.Types.ObjectId.isValid(courseId)) {
        throw new BadRequestError("Invalid course ID");
      }
      course = await Course.findById(courseId).session(session);
      if (!course) {
        throw new NotFoundError("Course not found");
      }
    }

    // Update basic user fields
    if (name) user.name = name;
    if (email) {
      const existing = await User.findOne({ email, _id: { $ne: studentId } }).session(session);
      if (existing) {
        throw new ConflictError("Email already in use by another user");
      }
      user.email = email;
    }
    if (phone) user.phone = phone;
    user.status = status ?? user.status

    await user.save({ session });

    // Update student record
    let studentInfo = await Student.findOne({ userId: studentId }).session(session);
    if (!studentInfo) {
      studentInfo = await Student.create([{
        userId: studentId,
        courseId: courseId,
        enrollmentDate: new Date(),
      }], { session });
    } else {
      // Handle profile image logic
      if (profile_image) {
        const isBase64 = /^data:image\/(png|jpeg|jpg|gif);base64,/.test(profile_image);
        const isUrl = /^https?:\/\//i.test(profile_image);

        if (isBase64) {
          try {
            const uploadedUrl = await uploadBase64ToS3(profile_image, "student-profiles");
            studentInfo.profile_image = uploadedUrl;
          } catch (err) {
            throw new BadRequestError("Error uploading profile image to S3: " + err.message);
          }
        } else if (!isUrl && profile_image.trim() !== "") {
          throw new BadRequestError("Invalid profile image format. Must be base64 or https URL.");
        }
      }

      if (courseId) studentInfo.courseId = courseId;
      studentInfo.status = status;
      studentInfo.mode = mode;
      await studentInfo.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    res.json({
      message: "Student updated successfully",
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        mode: studentInfo.mode,
        profileImage: studentInfo.profile_image,
        course: course ? { id: course._id, title: course.title } : undefined,
        status: status
      }
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
}

// Delete student
async function deleteStudent(req, res, next) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const isPermission = await hasPermission(req.user?.id, "Delete Student");
    if (!isPermission) {
      throw new ForbiddenError("User Doesn't have permission to delete student")
    }
    const { studentId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      throw new BadRequestError("Invalid student ID");
    }

    const user = await User.findById(studentId).session(session);
    if (!user) {
      throw new NotFoundError("User not found");
    }

    // Check role is student
    const role = await Roles.findById(user.roleId).session(session);
    if (!role || !/student/i.test(role.role_name)) {
      throw new BadRequestError("User is not a student");
    }

    // Prevent deletion if dependencies exist
    await checkDependencies("Student", user._id, [
      "studentId"
    ]);

    // Delete Student record
    await Student.deleteOne({ userId: studentId }).session(session);

    // Delete User record
    const deletedStudent = await User.deleteOne({ _id: studentId }).session(session);

    await session.commitTransaction();
    session.endSession();

    res.json({
      status: "success",
      message: "Student deleted successfully",
      data: user,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
}

const changeStudentPassword = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = req.user.id;
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      throw new BadRequestError("Both old and new passwords are required");
    }

    // Fetch user
    const user = await User.findById(userId).populate("roleId").session(session);
    if (!user) {
      throw new NotFoundError("User not found");
    }

    //Verify user is a student
    const role = user?.roleId?.role_name?.toLowerCase();
    if (role !== "student") {
      throw new InternalServerError("You are not authorized to change password");
    }

    // Verify old password
    const isMatch = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isMatch) {
      throw new InternalServerError("Old password is incorrect");
    }

    // Check that old and new passwords are not the same
    const isSamePassword = await bcrypt.compare(newPassword, user.passwordHash);
    if (isSamePassword) {
      throw new InternalServerError("New password cannot be the same as the old password");
    }

    // Hash and update new password
    const newHashedPassword = await bcrypt.hash(newPassword, 10);
    user.passwordHash = newHashedPassword;
    await user.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      status: "success",
      message: "Password changed successfully",
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

const getStudentsByCourseIdForDropdown = async (req, res, next) => {
  try {
    const { courseId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      throw new BadRequestError("Invalid Course ID");
    }

    // Check if course exists
    const course = await Course.findById(courseId);
    if (!course) {
      throw new NotFoundError("Course not found.");
    }

    // Find students enrolled in the course
    const students = await Student.find({ courseId })
      .populate({
        path: 'userId',
        match: { status: true },
        select: 'name email phone status createdAt',
      })
      .lean();

    const result = students.map(student => ({
      _id: student.userId?._id,
      name: student.userId?.name,
    }));

    res.status(200).json({
      message: "Students fetched successfully",
      course: {
        id: course._id,
        title: course.title,
      },
      total: result.length,
      students: result,
    });
  } catch (err) {
    next(err);
  }
};

const getStudentsByCourseId = async (req, res, next) => {
  try {
    const { courseId } = req.params;
    const { date, page = 1, limit = 10, search = "" } = req.query;

    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      throw new BadRequestError("Invalid Course ID");
    }
    if (!date) {
      throw new BadRequestError("Date query parameter is required");
    }

    // Check course
    const course = await Course.findById(courseId);
    if (!course) throw new NotFoundError("Course not found.");

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get all students of course with populated user
    let students = await Student.find({ courseId })
      .populate({
        path: 'userId',
        match: { status: true },
        select: 'name email phone status createdAt',
      })
      .lean();

    // Filter by search (after population)
    if (search) {
      const regex = new RegExp(search, "i");
      students = students.filter(
        (s) =>
          s.userId?.name?.match(regex) ||
          s.userId?.email?.match(regex) ||
          s.userId?.phone?.match(regex)
      );
    }

    const totalStudents = students.length;

    // Apply pagination
    const paginatedStudents = students.slice(skip, skip + parseInt(limit));

    // Get attendance for the date
    const studentIds = paginatedStudents.map((s) => s.userId._id);
    const attendanceRecords = await Attendance.find({
      courseId,
      studentId: { $in: studentIds },
      date: new Date(date),
    }).lean();

    const attendanceMap = {};
    attendanceRecords.forEach((att) => {
      attendanceMap[att.studentId.toString()] = att.present;
    });

    const result = paginatedStudents.map((student) => ({
      _id: student.userId._id,
      name: student.userId.name,
      email: student.userId.email,
      phone: student.userId.phone,
      status: student.userId.status,
      attendance: attendanceMap[student.userId._id.toString()] ?? null,
    }));

    res.status(200).json({
      message: "Students fetched successfully",
      course: { id: course._id, title: course.title },
      page: parseInt(page),
      limit: parseInt(limit),
      total: totalStudents,
      totalPages: Math.ceil(totalStudents / parseInt(limit)),
      students: result,
    });
  } catch (err) {
    next(err);
  }
};

// list students by tutor
const listStudentsByTutor = async (req, res, next) => {
  try {
    const { tutorId } = req.params;
    const { page = 1, limit = 10, search = "", courseId } = req.query;

    if (!tutorId) throw new BadRequestError("Tutor ID is required.");

    // Pagination
    const skip = (page - 1) * limit;

    // Search regex
    const searchRegex = new RegExp(search, "i");

    // Fetch tutor and their courses
    const tutor = await Tutor.findOne({ userId: tutorId }).lean();
    if (!tutor) throw new NotFoundError("Tutor not found.");

    let tutorCourseIds = tutor.courseIds || [];
    if (courseId) {
      const tutorCourseIdsStr = tutorCourseIds.map((id) => id.toString());
      if (!tutorCourseIdsStr.includes(courseId.toString())) {
        return res.json({
          status: "success",
          data: [],
          total: 0,
          page,
          limit,
          totalPages: 0,
        });
      }
      tutorCourseIds = [courseId];
    }

    if (tutorCourseIds.length === 0) {
      return res.json({
        status: "success",
        data: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
      });
    }

    // Get student role
    const studentRole = await Roles.findOne({ role_name: /student/i });
    if (!studentRole) throw new NotFoundError("Student role not found.");

    // Fetch students
    const studentInfos = await Student.find({
      courseId: { $in: tutorCourseIds },
    })
      .populate({
        path: "userId",
        match: {
          status: true,
          $or: [
            { name: { $regex: searchRegex } },
            { email: { $regex: searchRegex } },
            { phone: { $regex: searchRegex } },
          ],
        },
        select: "name email phone roleId",
        populate: { path: "roleId", select: "role_name" },
      })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Filter valid students
    const filteredStudents = studentInfos.filter((s) => s.userId);

    // Collect student IDs for attendance query
    const studentIds = filteredStudents.map((s) => s.userId._id);

    // Fetch attendance stats for all students in one go (optimized)
    const attendanceStats = await Attendance.aggregate([
      {
        $match: {
          studentId: { $in: studentIds.map((id) => new mongoose.Types.ObjectId(id)) },
          courseId: { $in: tutorCourseIds.map((id) => new mongoose.Types.ObjectId(id)) },
        },
      },
      {
        $group: {
          _id: "$studentId",
          totalDays: { $sum: 1 },
          presentDays: {
            $sum: { $cond: [{ $eq: ["$present", true] }, 1, 0] },
          },
        },
      },
      {
        $project: {
          _id: 1,
          attendancePercentage: {
            $cond: [
              { $eq: ["$totalDays", 0] },
              0,
              {
                $round: [
                  { $multiply: [{ $divide: ["$presentDays", "$totalDays"] }, 100] },
                  2,
                ],
              },
            ],
          },
        },
      },
    ]);

    // Map attendance stats by studentId
    const attendanceMap = {};
    attendanceStats.forEach((a) => {
      attendanceMap[a._id.toString()] = a.attendancePercentage;
    });

    // Build final result
    const students = filteredStudents.map((s) => ({
      _id: s.userId._id,
      name: s.userId.name,
      email: s.userId.email,
      phone: s.userId.phone,
      role: s.userId.roleId?.role_name || "N/A",
      courseId: s.courseId,
      enrollmentDate: s.enrollmentDate,
      attendancePercentage: attendanceMap[s.userId._id.toString()] ?? 0,
    }));

    const total = await Student.countDocuments({
      courseId: { $in: tutorCourseIds },
    });

    res.json({
      status: "success",
      data: students,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    next(err);
  }
};

// get student details by id
const getStudentDetailsWithSubmissions = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const { status, page = 1, limit = 10 } = req.query;

    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      throw new BadRequestError("Invalid Student ID.");
    }

    // Get student user
    const user = await User.findById(studentId).lean();
    if (!user || !user?.status) throw new NotFoundError("Student not found.");

    // Get student record (enrollment info)
    const studentInfo = await Student.findOne({ userId: studentId }).lean();
    if (!studentInfo) throw new NotFoundError("Student not found.");

    // Get course details
    const course = await Course.findById(studentInfo.courseId).lean();

    // Calculate real attendance percentage
    const attendanceRecords = await Attendance.find({ studentId });
    const totalDays = attendanceRecords.length;
    const presentDays = attendanceRecords.filter(a => a.present).length;
    const attendancePercentage = totalDays > 0 ? ((presentDays / totalDays) * 100).toFixed(2) : 0;

    // Build submission filter
    const filter = { studentId: studentInfo.userId };
    if (status) filter.status = status;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.max(1, parseInt(limit));
    const skip = (pageNum - 1) * limitNum;

    // Fetch submissions with pagination
    const totalSubmissions = await AssignmentSubmission.countDocuments(filter);
    const submissions = await AssignmentSubmission.find(filter)
      .populate("assignmentId", "title deadline description")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Response
    res.status(200).json({
      message: "Student details fetched successfully.",
      student: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        profile_image: studentInfo?.profile_image,
        mode: studentInfo?.mode,
        course: course ? { id: course._id, title: course.title } : null,
        attendancePercentage,
      },
      submissions: {
        data: submissions,
        count: submissions.length,
        total: totalSubmissions,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalSubmissions / limitNum),
      },
    });
  } catch (err) {
    next(err);
  }
};

const updateStudentProfile = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const studentId = req.user.id;
    const { name, email, phone, courseId, profile_image } = req.body;

    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      throw new BadRequestError("Invalid student ID");
    }

    const user = await User.findById(studentId).session(session);
    if (!user) throw new NotFoundError("User not found");

    const role = await Roles.findById(user.roleId).session(session);
    if (!role || !/student/i.test(role.role_name)) {
      throw new ForbiddenError("User is not a student");
    }

    // Validate course if provided
    let course = null;
    if (courseId) {
      if (!mongoose.Types.ObjectId.isValid(courseId)) {
        throw new BadRequestError("Invalid course ID");
      }
      course = await Course.findById(courseId).session(session);
      if (!course) throw new NotFoundError("Course not found");
    }

    // Update user details
    if (name) user.name = name;
    if (email) {
      const existing = await User.findOne({ email, _id: { $ne: studentId } }).session(session);
      if (existing) throw new ConflictError("Email already in use by another user");
      user.email = email;
    }
    if (phone) user.phone = phone;

    await user.save({ session });

    // Update student record
    let studentInfo = await Student.findOne({ userId: studentId }).session(session);
    if (!studentInfo) {
      studentInfo = await Student.create([{ userId: studentId, courseId }], { session });
    } else {
      // handle profile image
      if (profile_image) {
        const isBase64 = /^data:image\/(png|jpeg|jpg|gif);base64,/.test(profile_image);
        const isUrl = /^https?:\/\//i.test(profile_image);

        if (isBase64) {
          try {
            const uploadedUrl = await uploadBase64ToS3(profile_image, "student-profiles");
            studentInfo.profile_image = uploadedUrl;
          } catch (err) {
            throw new BadRequestError("Error uploading profile image to S3: " + err.message);
          }
        } else if (!isUrl && profile_image.trim() !== "") {
          throw new BadRequestError("Invalid profile image format. Must be base64 or https URL.");
        }
        // If null or existing URL, skip update
      }

      if (courseId) studentInfo.courseId = courseId;
      await studentInfo.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    res.json({
      message: "Profile updated successfully",
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        profileImage: studentInfo.profile_image,
        course: course ? { id: course._id, title: course.title } : undefined,
      },
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
}

const studentHome = async (req, res, next) => {
  try {
    const studentId = req.user?.id;

    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      throw new BadRequestError("Invalid student ID");
    }

    // Get student details
    const student = await Student.findOne({ userId: studentId })
      .populate("courseId", "courseName duration")
      .populate("userId", "name email phone")
      .lean();

    if (!student) throw new NotFoundError("Student not found");

    const courseId = student.courseId?._id;

    // ---------- ATTENDANCE PERCENTAGE ----------
    const attendanceStats = await Attendance.aggregate([
      {
        $match: {
          studentId: new mongoose.Types.ObjectId(studentId),
          ...(courseId && { courseId: new mongoose.Types.ObjectId(courseId) }),
        },
      },
      {
        $group: {
          _id: "$studentId",
          totalDays: { $sum: 1 },
          presentDays: { $sum: { $cond: [{ $eq: ["$present", true] }, 1, 0] } },
        },
      },
      {
        $project: {
          _id: 0,
          attendancePercentage: {
            $cond: [
              { $eq: ["$totalDays", 0] },
              0,
              {
                $round: [
                  {
                    $multiply: [
                      { $divide: ["$presentDays", "$totalDays"] },
                      100,
                    ],
                  },
                  2,
                ],
              },
            ],
          },
        },
      },
    ]);

    const attendancePercentage = attendanceStats[0]?.attendancePercentage ?? 0;

    // ---------- PENDING ASSIGNMENTS ----------
    const pendingAssignmentsCount = await AssignmentSubmission.countDocuments({
      studentId: new mongoose.Types.ObjectId(studentId),
      status: { $in: ["pending", "submitted"] }, // not reviewed yet
    });

    // ---------- RESPONSE ----------
    res.status(200).json({
      success: true,
      data: {
        studentDetails: {
          id: student._id,
          name: student.userId?.name,
          email: student.userId?.email,
          phone: student.userId?.phone,
          course: student.courseId?.courseName,
          courseDuration: student.courseId?.duration,
          profile_image: student?.profile_image || null
        },
        stats: {
          attendancePercentage,
          pendingAssignmentsCount,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

const studentPerformance = async (req, res, next) => {
  try {
    const studentId = req.user?.id;
    const { page = 1, limit = 10 } = req.query;

    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      throw new BadRequestError("Invalid student ID");
    }

    // Find Student
    const student = await Student.findOne({ userId: studentId }).lean();
    if (!student) throw new NotFoundError("Student not found");

    const courseId = student.courseId;

    // ---------- ATTENDANCE PERCENTAGE ----------
    const attendanceStats = await Attendance.aggregate([
      {
        $match: {
          studentId: new mongoose.Types.ObjectId(studentId),
          courseId: new mongoose.Types.ObjectId(courseId),
        },
      },
      {
        $group: {
          _id: "$studentId",
          totalDays: { $sum: 1 },
          presentDays: { $sum: { $cond: [{ $eq: ["$present", true] }, 1, 0] } },
        },
      },
      {
        $project: {
          _id: 0,
          attendancePercentage: {
            $cond: [
              { $eq: ["$totalDays", 0] },
              0,
              {
                $round: [
                  {
                    $multiply: [
                      { $divide: ["$presentDays", "$totalDays"] },
                      100,
                    ],
                  },
                  2,
                ],
              },
            ],
          },
        },
      },
    ]);

    const attendancePercentage = attendanceStats[0]?.attendancePercentage ?? 0;

    // ---------- ASSIGNMENT PERFORMANCE ----------
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const totalAssignments = await AssignmentSubmission.countDocuments({
      studentId: new mongoose.Types.ObjectId(studentId),
    });

    const assignments = await AssignmentSubmission.find({
      studentId: new mongoose.Types.ObjectId(studentId),
    })
      .populate("assignmentId", "title totalMarks")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Format assignment data
    const formattedAssignments = assignments.map((a) => {
      const totalMarks = a.assignmentId?.totalMarks || 0;
      const obtained = a.marks ?? 0;
      const percentage = totalMarks
        ? Math.round((obtained / totalMarks) * 100)
        : 0;
      return {
        assignmentId: a.assignmentId?._id,
        title: a.assignmentId?.title || "Untitled",
        marks: obtained,
        totalMarks,
        percentage,
        status: a.status,
        submittedAt: a.submittedAt,
        reviewedAt: a.reviewedAt,
        comment: a.comment || "",
      };
    });

    // ---------- AVERAGE MARKS ----------
    const gradedAssignments = formattedAssignments.filter(
      (a) => a.totalMarks > 0 && a.marks !== null
    );
    const averageMarksPercentage =
      gradedAssignments.length > 0
        ? Math.round(
          gradedAssignments.reduce((sum, a) => sum + a.percentage, 0) /
          gradedAssignments.length
        )
        : 0;

    // ---------- RESPONSE ----------
    res.status(200).json({
      success: true,
      data: {
        studentId,
        courseId,
        attendancePercentage,
        averageMarksPercentage,
        totalAssignments,
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalAssignments / limit),
        assignments: formattedAssignments,
      },
    });
  } catch (err) {
    next(err);
  }
};

const getStudentAttendance = async (req, res, next) => {
  try {
    const studentId = req.user?.id;
    const { page = 1, limit = 10, month, year } = req.query;

    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      throw new BadRequestError("Invalid student ID");
    }

    const student = await Student.findOne({ userId: studentId }).lean();
    if (!student) throw new NotFoundError("Student not found");

    const courseId = student.courseId;

    // ---------- BUILD FILTER ----------
    const filter = {
      studentId: new mongoose.Types.ObjectId(studentId),
      courseId: new mongoose.Types.ObjectId(courseId),
    };

    // Month and Year Filter
    if (year && isNaN(year)) throw new BadRequestError("Invalid year format");
    if (month && (isNaN(month) || month < 1 || month > 12))
      throw new BadRequestError("Invalid month format");

    if (year) {
      const selectedYear = parseInt(year);
      let startDate = new Date(selectedYear, 0, 1);
      let endDate = new Date(selectedYear + 1, 0, 1);

      if (month) {
        const selectedMonth = parseInt(month) - 1;
        startDate = new Date(selectedYear, selectedMonth, 1);
        endDate = new Date(selectedYear, selectedMonth + 1, 1);
      }

      filter.date = { $gte: startDate, $lt: endDate };
    }

    // ---------- PAGINATION ----------
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const totalRecords = await Attendance.countDocuments(filter);

    const attendanceRecords = await Attendance.find(filter)
      .sort({ date: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // ---------- SUMMARY ----------
    const totalDays = totalRecords;
    const presentDays = attendanceRecords.filter((a) => a.present).length;

    const attendanceStats = await Attendance.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$studentId",
          totalDays: { $sum: 1 },
          presentDays: {
            $sum: { $cond: [{ $eq: ["$present", true] }, 1, 0] },
          },
        },
      },
      {
        $project: {
          _id: 0,
          totalDays: 1,
          presentDays: 1,
          attendancePercentage: {
            $cond: [
              { $eq: ["$totalDays", 0] },
              0,
              {
                $round: [
                  {
                    $multiply: [
                      { $divide: ["$presentDays", "$totalDays"] },
                      100,
                    ],
                  },
                  2,
                ],
              },
            ],
          },
        },
      },
    ]);

    const summary = attendanceStats[0] || {
      totalDays: 0,
      presentDays: 0,
      attendancePercentage: 0,
    };

    // ---------- RESPONSE ----------
    res.status(200).json({
      success: true,
      data: {
        studentId,
        courseId,
        summary,
        totalRecords,
        currentPage: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalRecords / limit),
        attendanceRecords: attendanceRecords.map((a) => ({
          id: a._id,
          date: a.date,
          present: a.present,
          createdAt: a.createdAt,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
};

const checkEmail = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) throw new BadRequestError("Email is required");

    const user = await User.findOne({ email }).populate("roleId");
    if (!user) throw new NotFoundError("Email not found");

    // Check if user is a student
    if (!user.roleId || !/student/i.test(user.roleId.role_name)) {
      throw new ForbiddenError("Invalid student");
    }

    // Generate and store OTP
    const otp = generateOTP();
    user.otpCode = otp;
    user.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins validity
    await user.save();

    // Send email with Brevo
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; color: #333;">
        <h2>Password Reset Request</h2>
        <p>Hello ${user.name || "Student"},</p>
        <p>Your OTP for password reset is:</p>
        <h3 style="color:#2E86C1;">${otp}</h3>
        <p>This OTP is valid for 10 minutes.</p>
        <p>If you didn’t request a password reset, please ignore this email.</p>
        <br/>
        <p>Regards,<br/>Your App Team</p>
      </div>
    `;

    await sendBrevoEmail(email, "Password Reset OTP", htmlContent);

    res.json({
      status: "success",
      message: "OTP sent successfully to your email",
    });
  } catch (err) {
    console.log(err)
    next(err);
  }
};

const verifyOtp = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) throw new BadRequestError("Email and OTP are required");

    const user = await User.findOne({ email }).populate("roleId");
    if (!user) throw new NotFoundError("Student not found");

    if (!user.roleId || !/student/i.test(user.roleId.role_name)) {
      throw new ForbiddenError("Invalid student");
    }

    // Validate OTP
    if (!user.otpCode || user.otpCode !== otp) {
      throw new BadRequestError("Invalid OTP");
    }

    // Check OTP expiry
    if (new Date() > new Date(user.otpExpiresAt)) {
      throw new BadRequestError("OTP expired. Please request a new one.");
    }

    user.otpVerified = true;
    await user.save();

    res.json({ status: "success", message: "OTP verified successfully" });
  } catch (err) {
    next(err);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const { email, newPassword } = req.body;
    if (!email || !newPassword)
      throw new BadRequestError("Email and new password are required");

    const user = await User.findOne({ email }).populate("roleId");
    if (!user) throw new NotFoundError("Student not found");

    if (!user.roleId || !/student/i.test(user.roleId.role_name)) {
      throw new ForbiddenError("Invalid student");
    }

    if (!user.otpVerified) throw new ForbiddenError("OTP not verified");

    // Check if new password same as old
    const isSamePassword = await bcrypt.compare(newPassword, user.passwordHash);
    if (isSamePassword)
      throw new BadRequestError("New password cannot be the same as old password");

    // Update password
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.otpVerified = false;
    user.otpCode = undefined;
    user.otpExpiresAt = undefined;
    await user.save();

    res.json({ status: "success", message: "Password reset successfully" });
  } catch (err) {
    next(err);
  }
};

const getStudentProfileForAdmin = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { page = 1, limit = 10, status } = req.query;

    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ success: false, message: "Invalid student ID" });
    }

    // Get student with user details
    const student = await Student.findOne({ userId: studentId })
      .populate("userId", "name email phone")
      .populate("courseId", "title");

    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    //  Get attendance details
    const attendanceRecords = await Attendance.find({ studentId });
    const totalDays = attendanceRecords.length;
    const presentDays = attendanceRecords.filter(a => a.present).length;
    const attendancePercentage = totalDays > 0 ? ((presentDays / totalDays) * 100).toFixed(2) : 0;

    //Get assignment submission summary
    const filter = { studentId };
    if (status) filter.status = status; // Apply filter if provided

    const totalAssignments = await AssignmentSubmission.countDocuments({ studentId });
    const submittedAssignments = await AssignmentSubmission.countDocuments({ studentId, status: "submitted" });
    const pendingAssignments = await AssignmentSubmission.countDocuments({ studentId, status: "pending" });
    const reviewdAssignments = await AssignmentSubmission.countDocuments({ studentId, status: 'reviewed' })

    // Paginated list of assignment submissions
    const skip = (page - 1) * limit;

    const assignmentSubmissions = await AssignmentSubmission.find(filter)
      .populate("assignmentId", "title dueDate") // populate assignment info
      .sort({ submittedAt: -1 }) // newest first
      .skip(skip)
      .limit(parseInt(limit));

    const totalFiltered = await AssignmentSubmission.countDocuments(filter);

    // Combine results
    const profileData = {
      studentInfo: {
        name: student.userId.name,
        email: student.userId.email,
        phone: student.userId.phone,
        course: student.courseId?.title,
        profileImage: student.profile_image,
        enrollmentDate: student.enrollmentDate,
        mode: student.mode,
      },
      attendance: {
        totalDays,
        presentDays,
        attendancePercentage,
      },
      assignments: {
        summary: {
          totalAssignments,
          submittedAssignments,
          pendingAssignments,
          reviewdAssignments
        },
        submissions: {
          totalSubmissions: totalFiltered,
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalFiltered / limit),
          list: assignmentSubmissions,
        },
      },
    };

    res.status(200).json({
      success: true,
      message: "Student profile fetched successfully",
      data: profileData,
    });
  } catch (err) {
    console.error("Error fetching student profile:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

module.exports = {
  createStudent,
  listStudents,
  updateStudent,
  deleteStudent,
  getStudentsByCourseId,
  listStudentsByTutor,
  getStudentDetailsWithSubmissions,
  changeStudentPassword,
  updateStudentProfile,
  studentHome,
  getStudentsByCourseIdForDropdown,
  studentPerformance,
  getStudentAttendance,
  checkEmail,
  verifyOtp,
  resetPassword,
  getStudentProfileForAdmin
};
