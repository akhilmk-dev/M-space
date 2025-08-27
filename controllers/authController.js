const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Student = require('../models/Student');
const Tutor = require('../models/Tutor');
const catchAsync = require('../utils/catchAsync');
const { BadRequestError, ConflictError, UnAuthorizedError, ForbiddenError } = require('../utils/customErrors');
const { generateAccessToken, generateRefreshToken } = require('../utils/generateTokens');

const getModel = (role) => {
  if (!role) throw new BadRequestError("Role is required");
  return role === 'student' ? Student : Tutor;
};

exports.register = catchAsync(async (req, res) => {
  const { name, email, password, role } = req.body;

  const Model = getModel(role);
  const existingUser = await Model.findOne({ email });

  if (existingUser) {
    throw new ConflictError('Email already exists');
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = new Model({ name, email, password: hashedPassword });
  await user.save();

  res.status(201).json({
    message: 'User registered successfully',
    role,
  });
});

exports.login = catchAsync(async (req, res) => {
  const { email, password, role } = req.body;

  if (!email || !password || !role) {
    throw new BadRequestError('Email, password, and role are required');
  }

  const Model = getModel(role);
  const user = await Model.findOne({ email });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new UnAuthorizedError('Invalid credentials');
  }

  const access_token = generateAccessToken(user, role);
  const refresh_token = generateRefreshToken(user, role);

  user.refresh_token = refresh_token;
  const newUser = await user.save();

  res.status(200).json({ status:"success", access_token, refresh_token,data:{_id:newUser?._id,name:newUser?.name,email:newUser?.email} });
});

exports.refreshToken = catchAsync(async (req, res) => {
  const { refresh_token, role } = req.body;

  if (!refresh_token || !role) {
    throw new BadRequestError('Refresh token and role are required');
  }

  const Model = getModel(role);

  const payload = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);
  const user = await Model.findById(payload.id);

  if (!user || user.refresh_token !== refresh_token) {
    throw new ForbiddenError('Invalid or expired refresh token');
  }

  const newAccess_token = generateAccessToken(user, role);
  const newRefresh_token = generateRefreshToken(user, role);

  user.refresh_token = newRefresh_token;
  await user.save();

  res.status(200).json({ access_token: newAccess_token, refresh_token: newRefresh_token });
});
