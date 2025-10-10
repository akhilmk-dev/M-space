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

// Create only student (you already have)
const createStudent = async(req, res, next)=> {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const isPermission = await hasPermission(req.user?.id, "Add Student");
    if (!isPermission ) {
      throw new ForbiddenError("User Doesn't have permission to create student")
    }
    const { name, email, phone, password, courseId, profile_image, status } = req.body;
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
        status: true
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
        status: status 
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

// List students with pagination & search
async function listStudents(req, res, next) {
  try {
    const isPermission = await hasPermission(req.user?.id, "List Student");
    if (!isPermission ) {
      throw new ForbiddenError("User Doesn't have permission to list student")
    }
    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    //  Search
    const search = req.query.search || '';
    const searchRegex = new RegExp(search, 'i');

    // Sort (field:direction)
    let sortField = 'createdAt';
    let sortOrder = -1; // default: descending

    if (req.query.sortBy) {
      const [field, order] = req.query.sortBy.split(':');
      sortField = field || 'createdAt';
      sortOrder = order === 'asc' ? 1 : -1;
    }

    // Student role
    const studentRole = await Roles.findOne({ role_name: /student/i });
    if (!studentRole) {
      throw new NotFoundError('Student role not found.');
    }

    //  Match condition
    const match = {
      roleId: studentRole._id,
      $or: [
        { name: { $regex: searchRegex } },
        { email: { $regex: searchRegex } },
        { phone: { $regex: searchRegex } },
      ]
    };

    // Count
    const total = await User.countDocuments(match);

    // Fetch users with sort + pagination
    const users = await User.find(match)
      .populate('roleId', 'role_name')
      .sort({ [sortField]: sortOrder })
      .collation({ locale: "en", strength: 2 }) 
      .skip(skip)
      .limit(limit)
      .lean();

    // 8. Join student info + course
    const students = await Promise.all(users.map(async (u) => {
      const studentInfo = await Student.findOne({ userId: u._id }).lean();
      let course = null;
      if (studentInfo) {
        course = await Course.findById(studentInfo.courseId).lean();
      }
      return {
        id: u._id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.roleId.role_name,
        course: course ? { id: course._id, title: course.title } : null,
        enrollmentDate: studentInfo ? studentInfo.enrollmentDate : null,
        profile_image: studentInfo?.profile_image || null
      };
    }));

    // 9. Response
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
    if (!isPermission ) {
      throw new ForbiddenError("User Doesn't have permission to edit student")
    }
    const { studentId } = req.params; // ID of student user
    const { name, email, phone, courseId, profile_image,status=true } = req.body;

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
        profileImage: studentInfo.profile_image,
        course: course ? { id: course._id, title: course.title } : undefined,
        status:status
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
    if (!isPermission ) {
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
      .populate('userId', 'name email phone status createdAt')
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
      .populate("userId", "name email phone status createdAt")
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
    const tutor = await Tutor.findOne({userId:tutorId}).lean();
    if (!tutor) throw new NotFoundError("Tutor not found.");

    let tutorCourseIds = tutor.courseIds || [];
    if (courseId) {
      const tutorCourseIdsStr = tutorCourseIds.map(id => id.toString());

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

    // Find students in these courses
    const studentRole = await Roles.findOne({ role_name: /student/i });
    if (!studentRole) throw new NotFoundError("Student role not found.");

    const match = {
      roleId: studentRole._id,
    };

    const studentInfos = await Student.find({
      courseId: { $in: tutorCourseIds },
    })
      .populate({
        path: "userId",
        match: {
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

    // Filter out students whose userId is null due to search
    const students = studentInfos
      .filter((s) => s.userId)
      .map((s) => ({
        _id: s.userId._id,
        name: s.userId.name,
        email: s.userId.email,
        phone: s.userId.phone,
        role: s.userId.roleId.role_name,
        courseId:s.courseId,
        enrollmentDate: s.enrollmentDate,
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

    //  Get student user
    const user = await User.findById(studentId).lean();
    if (!user) throw new NotFoundError("Student not found.");

    //  Get student record (enrollment info)
    const studentInfo = await Student.findOne({ userId: studentId }).lean();
    if (!studentInfo) throw new NotFoundError("Student enrollment not found.");

    //  Get course details
    const course = await Course.findById(studentInfo.courseId).lean();
    const attendancePercentage = Math.floor(Math.random() * (100 - 60 + 1)) + 60; 
    // Fetch submissions (with filters + pagination)
    const filter = { studentId: studentInfo.userId }; // note: studentInfo._id (not userId)
    if (status) {
      filter.status = status;
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.max(1, parseInt(limit));
    const skip = (pageNum - 1) * limitNum;

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
      }
    });
  } catch (err) {
    next(err);
  }
};

const  updateStudentProfile = async(req, res, next)=> {
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
  getStudentsByCourseIdForDropdown
};
