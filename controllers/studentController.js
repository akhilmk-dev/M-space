const mongoose = require('mongoose');
const User = require('../models/User');
const Course = require('../models/Course');
const Student = require('../models/Student');
const { BadRequestError, NotFoundError, ConflictError } = require('../utils/customErrors'); // adjust your error classes
const Roles = require('../models/Roles');
const bcrypt = require("bcrypt");

// Create only student (you already have)
async function createStudent(req, res, next) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { name, email, phone, password, courseId } = req.body;

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

    // create user
    const userDocs = await User.create(
      [{
        name,
        email,
        phone,
        passwordHash,
        roleId: studentRole._id,
        status: true,
      }],
      { session }
    );
    const user = userDocs[0];

    // create student record
    await Student.create(
      [{
        userId: user._id,
        courseId,
        enrollmentDate: new Date(),
      }],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      message: "Student created successfully.",
      student: {
        id: user._id,
        name: user.name,
        email: user.email,
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
}

// List students with pagination & search
async function listStudents(req, res, next) {
  try {
    // Parse query params
    const { page = 1, limit = 10, search = '' } = req.query;
    const skip = (page - 1) * limit;

    // Find student role id
    const studentRole = await Roles.findOne({ role_name: /student/i });
    if (!studentRole) {
      throw new NotFoundError("Student role not found.");
    }

    // Build search/filter condition
    const searchRegex = new RegExp(search, 'i');
    const match = {
      roleId: studentRole._id,
      $or: [
        { name: { $regex: searchRegex } },
        { email: { $regex: searchRegex } },
        { phone: { $regex: searchRegex } },
      ]
    };

    // Query total count
    const total = await User.countDocuments(match);

    // Query with skip + limit + optionally populate course
    const users = await User.find(match)
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .populate({
        path: 'roleId',
        select: 'role_name'
      })
      .populate({
        path: '_id', 
        // Better: use Student model to join
      })
      .lean();

    // To get course info, join via Student
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
      };
    }));

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
}

// Update student
async function updateStudent(req, res, next) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { studentId } = req.params; // id of student user
    const { name, email, phone, courseId } = req.body;

    // Validate
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
    
    // Update course if provided
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

    // Update user fields
    if (name) user.name = name;
    if (email) {
      // check duplicate email
      const existing = await User.findOne({ email, _id: { $ne: studentId } }).session(session);
      if (existing) {
        throw new ConflictError("Email already in use by another user");
      }
      user.email = email;
    }
    if (phone) user.phone = phone;

    await user.save({ session });

    // Update Student record
    const studentInfo = await Student.findOne({ userId: studentId }).session(session);
    if (!studentInfo) {
      // if not exist, create
      await Student.create([{
        userId: studentId,
        courseId: courseId,
        enrollmentDate: new Date(),
      }], { session });
    } else {
      if (courseId) studentInfo.courseId = courseId;
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
        course: course ? { id: course._id, title: course.title } : undefined,
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

    // Delete Student record
    await Student.deleteOne({ userId: studentId }).session(session);

    // Optionally delete user or set inactive
    const deletedStudent = await User.deleteOne({ _id: studentId }).session(session);

    await session.commitTransaction();
    session.endSession();

    res.json({status:"success", message: "Student deleted successfully",data:user });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
}

const getStudentsByCourseId = async (req, res, next) => {
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

module.exports = {
  createStudent,
  listStudents,
  updateStudent,
  deleteStudent,
  getStudentsByCourseId
};
