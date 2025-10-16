const Joi = require('joi');
const mongoose = require('mongoose');
// =====================
// Register Schema
// =====================

const registerSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(3)
    .max(50)
    .required()
    .messages({
      'string.base': 'Name must be a string',
      'string.empty': 'Name is required',
      'string.min': 'Name must be at least 3 characters',
      'string.max': 'Name must be at most 50 characters',
      'any.required': 'Name is required',
    }),

  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Email must be a valid email address',
      'string.empty': 'Email is required',
      'any.required': 'Email is required',
    }),

  password: Joi.string()
    .min(6)
    .required()
    .messages({
      'string.empty': 'Password is required',
      'string.min': 'Password must be at least 6 characters',
      'any.required': 'Password is required',
    }),

  phone: Joi.string()
    .pattern(/^[0-9]{10,15}$/)
    .required()
    .messages({
      'string.pattern.base': 'Phone number must be 10 to 15 digits',
      'string.empty': 'Phone number is required',
      'any.required': 'Phone number is required',
    }),

  role: Joi.string()
    .valid('Student', 'Tutor', 'Admin')
    .required()
    .messages({
      'any.only': 'Role must be one of Student, Tutor, or Admin',
      'string.empty': 'Role is required',
      'any.required': 'Role is required',
    }),
  status:Joi.boolean(),
  courseId: Joi.string()
    .when('role', {
      is: 'Student',
      then: Joi.string()
        .required()
        .custom((value, helpers) => {
          if (!mongoose.Types.ObjectId.isValid(value)) {
            return helpers.error('any.invalid');
          }
          return value;
        }, 'ObjectId validation')
        .messages({
          'any.required': 'Course ID is required for students',
          'any.invalid': 'Course ID must be a valid ObjectId',
        }),
      otherwise: Joi.forbidden(),
    }),
});

// =====================
// Login Schema
// =====================
const loginSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Email must be a valid email address',
      'string.empty': 'Email is required',
      'any.required': 'Email is required',
    }),

  password: Joi.string()
    .required()
    .messages({
      'string.empty': 'Password is required',
      'any.required': 'Password is required',
    }),

  role: Joi.string()
    .valid('Student', 'Tutor', 'Admin')
    .required()
    .messages({
      'any.only': 'Role must be one of Student, Tutor, or Admin',
      'string.empty': 'Role is required',
      'any.required': 'Role is required',
    }),
});

// =====================
// Refresh Token Schema
// =====================
const refreshTokenSchema = Joi.object({
  refresh_token: Joi.string()
    .required()
    .messages({
      'string.empty': 'Refresh token is required',
      'any.required': 'Refresh token is required',
    }),

  role: Joi.string()
    .valid('Student', 'Tutor', 'Admin')
    .required()
    .messages({
      'any.only': 'Role must be one of Student, Tutor, or Admin',
      'string.empty': 'Role is required',
      'any.required': 'Role is required',
    }),
});

module.exports = {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
};
