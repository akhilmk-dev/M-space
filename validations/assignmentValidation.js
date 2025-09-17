const Joi = require('joi');
const mongoose = require('mongoose');

const objectIdValidator = (value, helpers) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return helpers.error('any.invalid');
  }
  return value;
};

const fileSchema = Joi.object({
  name: Joi.string().required().messages({
    'string.empty': 'File name is required',
    'any.required': 'File name is required',
  }),
  base64: Joi.string().required().messages({
    'string.empty': 'Base64 content is required',
    'any.required': 'Base64 content is required',
  }),
});

const createAssignmentSchema = Joi.object({
  title: Joi.string().trim().min(3).max(200).required().messages({
    'string.empty': 'Title is required',
    'string.min': 'Title must be at least 3 characters',
    'string.max': 'Title must be at most 200 characters',
    'any.required': 'Title is required',
  }),

  description: Joi.string().trim().allow('', null),

  courseId: Joi.string()
    .required()
    .custom(objectIdValidator, 'ObjectId validation')
    .messages({
      'any.required': 'Course ID is required',
      'any.invalid': 'Invalid Course ID format',
    }),

  lessonId: Joi.string().required()
  .custom(objectIdValidator, 'ObjectId validation')
  .messages({
    'any.required': 'Lesson ID is required',
    'any.invalid': 'Invalid Lesson ID format',
  }),

  deadline: Joi.date().iso().required().messages({
    'date.base': 'Deadline must be a valid ISO date',
    'any.required': 'Deadline is required',
  }),

  files: Joi.array().items(fileSchema).default([]),

  assignedTo: Joi.array()
  .items(
    Joi.alternatives().try(
      Joi.string().valid('all'),
      Joi.string().custom(objectIdValidator, 'ObjectId validation')
    ).messages({
      'any.invalid': 'Invalid student ID format'
    })
  )
  .default([]),

  status: Joi.string()
    .valid('Active', 'Closed')
    .default('Active')
    .messages({
      'any.only': 'Status must be one of Active, Closed',
    }),

});

module.exports = {
  createAssignmentSchema,
};
