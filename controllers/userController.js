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
const checkDependencies = require("../helper/checkDependencies");

const createUser = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { name, email, phone, password, roleId,status } = req.body;
    // Check if user already exists
    const existingUser = await User.findOne({ email }).session(session);
    if (existingUser) {
      throw new ConflictError("Email already in use.");
    }

    // Validate roleId
    if (!mongoose.Types.ObjectId.isValid(roleId)) {
      throw new BadRequestError("Invalid roleId format.");
    }

    const roleDoc = await Role.findById(roleId).session(session);
    if (!roleDoc) {
      throw new BadRequestError("Role not found.");
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const newUser = await User.create(
      [{
        name,
        email,
        phone,
        passwordHash,
        roleId: roleDoc._id,
        status: status ,
      }],
      { session }
    );

    const user = newUser[0];

    // Commit transaction
    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      message: `${roleDoc.role_name} registered successfully.`,
      data: {
        _id: user?._id,
        name: user?.name,
        email: user?.email,
        phone: user?.phone,
        status: user?.status,
        createdAt:user?.createdAt,
        role: {
         role_name: roleDoc?.role_name,
         _id:roleDoc?._id
        },
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
    // 1. Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // 2. Search
    const search = req.query.search || "";
    const searchRegex = new RegExp(search, "i");

    // 3. Sort (field:direction)
    let sortField = "createdAt";
    let sortOrder = -1; // default: descending

    if (req.query.sortBy) {
      const [field, order] = req.query.sortBy.split(":");
      sortField = field || "createdAt";
      sortOrder = order === "asc" ? 1 : -1;
    }

    // 4. Exclude Tutor and Student roles
    const excludedRoles = ["Tutor", "Student"];
    const excludedRoleIds = await Role.find({
      role_name: { $in: excludedRoles },
    }).select("_id");
    const roleIdsToExclude = excludedRoleIds.map((r) => r._id);

    // 5. Match query
    const query = {
      name: { $regex: searchRegex },
      roleId: { $nin: roleIdsToExclude },
    };

    // 6. Count
    const total = await User.countDocuments(query);

    // 7. Fetch users with sort + collation
    const users = await User.find(query)
      .populate("roleId", "role_name")
      .select("name email phone status roleId createdAt updatedAt")
      .sort({ [sortField]: sortOrder })
      .collation({ locale: "en", strength: 2 }) 
      .skip(skip)
      .limit(limit)
      .lean();

    // 8. Format result
    const result = users.map((user) => ({
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      status: user.status,
      role: {
        role_name: user.roleId?.role_name || null,
        _id: user.roleId?._id,
      },
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }));

    // 9. Response
    res.status(200).json({
      message: "Users fetched successfully",
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
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
  const { name, email, phone, status, roleId} = req.body;

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

  let roleDoc = null;
  if (roleId) {
    roleDoc = await Role.findById(roleId);
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
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      status: user.status,
      role: {
        role_name:roleDoc?.role_name,
        _id:roleDoc?._id
      },
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

const deleteUserCascade = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new BadRequestError("Invalid userId format.");
    }

    const user = await User.findById(userId).populate("roleId").session(session);
    if (!user) throw new NotFoundError("User not found.");

    // Prevent deleting admin role users
    if (user.roleId && user.roleId.role_name.toLowerCase() === "admin") {
      throw new ConflictError("Can't delete a user with admin role");
    }

    // Step 1: Check dependencies before deleting
    await checkDependencies("User", user._id, [
      "userId",
      "studentId",
      "createdBy",
      "uploadedBy",
      "tutorId",
    ]);

    // Step 2: Delete user only if no dependencies found
    const deletedUser = await User.findByIdAndDelete(userId).session(session);

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      status: "success",
      message: "User deleted successfully",
      data: deletedUser,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

module.exports = {
  getUsers,
  createUser,
  updateUser,
  changePassword,
  getUserById,
  deleteUserCascade
};