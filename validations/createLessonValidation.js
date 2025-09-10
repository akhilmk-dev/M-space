const Joi = require('joi');
const mongoose = require('mongoose');

const objectIdValidator = Joi.string().custom((value, helpers) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return helpers.error('any.invalid');
  }
  return value;
}, 'ObjectId Validation').messages({
  'any.invalid': '{{#label}} must be a valid ObjectId',
});

const lessonSchema = Joi.object({
  title: Joi.string().min(1).required().messages({
    'string.empty': 'Title is required',
    'any.required': 'Title is required',
  }),
  orderIndex: Joi.number().integer().min(0).required().messages({
    'number.base': 'Order index must be a number',
    'number.min': 'Order index must be at least 0',
    'any.required': 'Order index is required',
  }),
  contentType: Joi.string().valid('video', 'pdf', 'audio', 'text').required().messages({
    'any.only': 'Content type must be one of video, pdf, audio, or text',
    'any.required': 'Content type is required',
  }),
  contentURL: Joi.string().uri().required().messages({
    'string.uri': 'Content URL must be a valid URI',
    'any.required': 'Content URL is required',
  }),
  duration: Joi.number().integer().min(1).required().messages({
    'number.base': 'Duration must be a number',
    'number.min': 'Duration must be at least 1 second',
    'any.required': 'Duration is required',
  }),
});

const createLessonsSchema = Joi.object({
  courseId: objectIdValidator.required().messages({
    'any.required': 'Course ID is required',
  }),
  moduleId: objectIdValidator.required().messages({
    'any.required': 'Module ID is required',
  }),
  chapterId: objectIdValidator.required().messages({
    'any.required': 'Chapter ID is required',
  }),
  lessons: Joi.array().items(lessonSchema).min(1).required().messages({
    'array.base': 'Lessons must be an array',
    'array.min': 'Lessons array cannot be empty',
    'any.required': 'Lessons array is required',
  }),
});

module.exports = { createLessonsSchema };
