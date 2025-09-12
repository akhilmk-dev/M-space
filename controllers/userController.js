const bcrypt = require("bcrypt");
const User = require("../models/User");
const Role = require("../models/Roles");
const Course = require('../models/Course')
const { registerSchema } = require('../validations/authValidation');

const {
  BadRequestError,
  UnAuthorizedError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} = require("../utils/customErrors");

const { default: mongoose } = require("mongoose");
const Student = require("../models/Student");


const createUser = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { name, email, phone, password, role, courseId } = req.body;

    // 1. Check if user already exists
    const existingUser = await User.findOne({ email }).session(session);
    if (existingUser) {
      throw new ConflictError("Email already in use.");
    }

    // 2. Find role
    const roleDoc = await Role.findOne({ role_name: role }).session(session);
    if (!roleDoc) {
      throw new BadRequestError(`Role '${role}' not found.`);
    }

    // 3. Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // 4. Create user
    const newUser = await User.create(
      [{
        name,
        email,
        phone,
        passwordHash,
        roleId: roleDoc._id,
        status: true,
      }],
      { session }
    );

    const user = newUser[0]; // since .create with array returns an array

    // 5. If Student, validate and create student record
    if (role.toLowerCase() === "student") {
      if (!courseId) {
        throw new BadRequestError("Course ID is required for students.");
      }

      if (!mongoose.Types.ObjectId.isValid(courseId)) {
        throw new BadRequestError("Invalid Course ID format.");
      }

      const courseExists = await Course.findById(courseId).session(session);
      if (!courseExists) {
        throw new NotFoundError("Course not found.");
      }

      await Student.create(
        [{
          userId: user._id,
          courseId,
          enrollmentDate: new Date(),
        }],
        { session }
      );
    }

    // commit transaction
    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      message: `${role} registered successfully.`,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        course:courseExists,
        role,
      },
    });
  } catch (err) {
    // Something failed — rollback transaction
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

const getUsers = async (req, res, next) => {
    try {
      // ======== Query Params ========
      const {
        page = 1,
        limit = 10,
        search = "",
        sortBy = "createdAt",
        sortOrder = "desc",
      } = req.query;
  
      const pageNumber = parseInt(page);
      const pageSize = parseInt(limit);
      const skip = (pageNumber - 1) * pageSize;
  
      // ======== Search Filter ========
      const searchFilter = search
        ? {
            name: { $regex: search, $options: "i" }, 
          }
        : {};
  
      // ======== Sort Options ========
      const sortOptions = {
        [sortBy]: sortOrder.toLowerCase() === "asc" ? 1 : -1,
      };
  
      // ======== Total Count ========
      const total = await User.countDocuments(searchFilter);
  
      // ======== Fetch Users ========
      const users = await User.find(searchFilter)
        .populate("roleId", "role_name")
        .select("name email phone status roleId createdAt updatedAt")
        .sort(sortOptions)
        .skip(skip)
        .limit(pageSize)
        .lean();
  
      // ======== Format Result ========
      const result = users.map(user => ({
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        isActive: user.status,
        role: user.roleId?.role_name || null,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      }));
  
      res.status(200).json({
        message: "Users fetched successfully",
        pagination: {
          total,
          page: pageNumber,
          limit: pageSize,
          totalPages: Math.ceil(total / pageSize),
        },
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };
  
  module.exports = {
    getUsers,
    createUser
  };
  