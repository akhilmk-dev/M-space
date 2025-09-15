const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
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

const { generateAccessToken, generateRefreshToken } = require("../utils/generateTokens");
const { default: mongoose } = require("mongoose");
const Student = require("../models/Student");

// ==========================
// REGISTER
// ==========================
const register = async (req, res, next) => {
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
    let course = null
    // 5. If Student, validate and create student record
    if (role.toLowerCase() === "student") {
      if (!courseId) {
        throw new BadRequestError("Course ID is required for students.");
      }

      if (!mongoose.Types.ObjectId.isValid(courseId)) {
        throw new BadRequestError("Invalid Course ID format.");
      }

      const courseExists = await Course.findById(courseId).session(session);
      let course = courseExists;
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
        course,
        role,
      },
    });
  } catch (err) {
    // Something failed — rollback transaction
    console.log(err)
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

// ==========================
// LOGIN
// ==========================
const login = async (req, res, next) => {
  try {
    const { email, password, role } = req.body; 

    if (!email || !password || !role) {
      throw new BadRequestError("Email, password, and role are required.");
    }

    // Find role document by role
    const roleDoc = await Role.findOne({ role_name: role });
    if (!roleDoc) {
      throw new BadRequestError("Invalid role specified.");
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user || !user.status) {
      throw new UnAuthorizedError("Invalid credentials.");
    }

    // Check if user's roleId matches roleDoc._id (or roleDoc.roleId if different)
    if (user.roleId.toString() !== roleDoc._id.toString()) {
      throw new UnAuthorizedError("Invalid Email");
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new UnAuthorizedError("Invalid credentials.");
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    const userObject = {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: {
        id: roleDoc.roleId,
        name: roleDoc.role_name,
        permissions: roleDoc.permissions,
      },
    };

// Conditionally add courseId to the user object
    if (roleDoc.role_name === 'Student') {
        const student = await Student.findOne({ userId: user._id });
        if (student) {
            userObject.courseId = student.courseId;
            // You can add any other student-specific data here
        }
    }

  res.status(200).json({
    message: "Login successful",
    accessToken,
    refreshToken,
    user: userObject,
  });
  } catch (err) {
    next(err);
  }
};

// ==========================
// REFRESH TOKEN
// ==========================
const refresh = async (req, res, next) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      throw new BadRequestError("Refresh token is required.");
    }

    let decoded;
    try {
      decoded = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);
    } catch (err) {
      throw new UnAuthorizedError("Invalid refresh token.");
    }

    const user = await User.findById(decoded.id);
    if (!user || !user.status) {
      throw new UnAuthorizedError("User not found or inactive.");
    }

    const newAccessToken = generateAccessToken(user);
    res.status(200).json({ accessToken: newAccessToken });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  login,
  register,
  refresh,
};
