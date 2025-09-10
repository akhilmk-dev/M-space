const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Role = require("../models/Roles");
const { registerSchema } = require('../validations/authValidation');

const {
  BadRequestError,
  UnAuthorizedError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} = require("../utils/customErrors");

const { generateAccessToken, generateRefreshToken } = require("../utils/generateTokens");

// ==========================
// REGISTER
// ==========================
const register = async (req, res, next) => {
  try {
    const { error, value } = registerSchema.validate(req.body, { abortEarly: false });
    if (error) {
      error.isJoi = true;
      throw error;
    }

    const { name, email, phone, password, role } = value; 

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new ConflictError("Email already in use.");
    }

    // Find roleId by role_name
    const roleDoc = await Role.findOne({ role_name: { $regex: `^${role}$`, $options: "i" } });
    if (!roleDoc) {
      throw new NotFoundError(`Role '${role}' not found.`);
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const newUser = new User({
      name,
      email,
      phone,
      roleId: roleDoc._id, 
      passwordHash,
      status: true,
    });

    await newUser.save();

    res.status(201).json({ status:"success", message: "User registered successfully.",data:newUser });
  } catch (err) {
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
      throw new UnAuthorizedError("Email is registered with a different role.");
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new UnAuthorizedError("Invalid credentials.");
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    res.status(200).json({
      message: "Login successful",
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: {
          id: roleDoc.roleId,
          name: roleDoc.role_name,
          permissions: roleDoc.permissions,
        },
      },
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
      throw new ForbiddenError("Invalid refresh token.");
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
