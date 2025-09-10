const Joi = require('joi');
const mongoose = require('mongoose');

// Custom validator for ObjectId
const objectIdValidator = (value, helpers) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return helpers.error('any.invalid');
  }
  return value;
};

const createChapterSchema = Joi.object({
  moduleId: Joi.string().required().custom(objectIdValidator).messages({
    'any.required': 'moduleId is required',
    'any.invalid': 'moduleId must be a valid ObjectId',
  }),
  title: Joi.string().trim().min(1).required().messages({
    'any.required': 'title is required',
    'string.empty': 'title cannot be empty',
  }),
  orderIndex: Joi.number().integer().required().messages({
    'any.required': 'orderIndex is required',
    'number.base': 'orderIndex must be a number',
    'number.integer': 'orderIndex must be an integer',
  }),
});

module.exports = createChapterSchema;