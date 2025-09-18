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
    const { name, email, phone, password, roleId, courseId } = req.body;

    // 1. Check if user already exists
    const existingUser = await User.findOne({ email }).session(session);
    if (existingUser) {
      throw new ConflictError("Email already in use.");
    }

    // 2. Validate roleId
    if (!mongoose.Types.ObjectId.isValid(roleId)) {
      throw new BadRequestError("Invalid roleId format.");
    }

    const roleDoc = await Role.findById(roleId).session(session);
    if (!roleDoc) {
      throw new BadRequestError("Role not found.");
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

    const user = newUser[0];

    // 5. If role is 'student', proceed to create Student record
    const roleName = roleDoc.role_name.toLowerCase();
    if (roleName === "student") {
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
      message: `${roleDoc.role_name} registered successfully.`,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: roleDoc.role_name,
        course: roleName === "student" ? courseExists : undefined,
      },
    });
  } catch (err) {
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
      role: {
        role_name: user.roleId?.role_name || null,
        _id: user.roleId._id
      },
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }));

    res.status(200).json({
      message: "Users fetched successfully",
      total,
      page: pageNumber,
      limit: pageSize,
      totalPages: Math.ceil(total / pageSize),
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

const getUserById = async (req, res, next) => {
try {
  const userId  = req.user.id;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new BadRequestError("Invalid userId format.");
  }

  const user = await User.findById(userId)
    .populate("roleId", "_id role_name")
    .select("name _id email phone status roleId createdAt updatedAt");

  if (!user) {
    throw new NotFoundError("User not found.");
  }

  res.status(200).json({
    message: "User fetched successfully",
    data: {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      isActive: user.status,
      role: {
        role_name: user.roleId?.role_name || null,
        _id: user.roleId?._id,
      },
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
  });
} catch (err) {
  next(err);
}
};

/**
* Update user details (name, email, phone, status, roleId)
*/
const updateUser = async (req, res, next) => {
try {
  const { userId } = req.params;
  const { name, email, phone, status, roleId } = req.body;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new BadRequestError("Invalid userId format.");
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError("User not found.");
  }

  // If updating email, check if already taken
  if (email && email !== user.email) {
    const existing = await User.findOne({ email });
    if (existing) throw new ConflictError("Email already in use.");
  }

  // If updating roleId, validate it
  if (roleId && !mongoose.Types.ObjectId.isValid(roleId)) {
    throw new BadRequestError("Invalid roleId format.");
  }

  if (roleId) {
    const roleDoc = await Role.findById(roleId);
    if (!roleDoc) throw new NotFoundError("Role not found.");
  }

  user.name = name ?? user.name;
  user.email = email ?? user.email;
  user.phone = phone ?? user.phone;
  user.status = status ?? user.status;
  user.roleId = roleId ?? user.roleId;

  await user.save();
  res.status(200).json({
    message: "User updated successfully",
    data: {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      isActive: user.status,
      roleId: user.roleId,
    },
  });
} catch (err) {
  next(err);
}
};

/**
* Change user password
*/
const changePassword = async (req, res, next) => {
try {
  const  userId  = req.user.id;
  const { current_password, new_password } = req.body;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new BadRequestError("Invalid userId format.");
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError("User not found.");
  }

  // Validate old password
  const isMatch = await bcrypt.compare(current_password, user.passwordHash);
  if (!isMatch) {
    throw new UnAuthorizedError("Old password is incorrect.");
  }

  // Hash new password
  const hashed = await bcrypt.hash(new_password, 10);
  user.passwordHash = hashed;
  await user.save();

  res.status(200).json({
    message: "Password changed successfully",
  });
} catch (err) {
  next(err);
}
};

module.exports = {
  getUsers,
  createUser,
  updateUser,
  changePassword,
  getUserById
};