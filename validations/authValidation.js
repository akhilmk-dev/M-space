const Joi = require('joi');

const registerSchema = Joi.object({
  name: Joi.string().trim().min(3).max(50).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  role: Joi.string().valid('student', 'tutor').required(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
  role: Joi.string().valid('student', 'tutor').required(),
});

const refreshTokenSchema = Joi.object({
  refresh_token: Joi.string().required(),
  role: Joi.string().valid('student', 'tutor').required(),
});

module.exports = {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
};
