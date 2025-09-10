const Joi = require('joi');

const objectId = Joi.string().regex(/^[0-9a-fA-F]{24}$/).messages({
  'string.pattern.base': 'Invalid ID format',
});

// ------------------- LESSON -------------------
const lessonSchema = Joi.object({
  _id: objectId.optional(),
  chapterId: objectId.optional(), 
  title: Joi.string().required().messages({ 'any.required': 'Lesson title is required' }),
  contentType: Joi.string().required().messages({ 'any.required': 'Content type is required' }),
  contentURL: Joi.string().uri().required().messages({
    'string.uri': 'Invalid content URL',
    'any.required': 'Content URL is required',
  }),
  duration: Joi.number().positive().required().messages({
    'any.required': 'Duration is required',
    'number.positive': 'Duration must be positive',
  }),
  orderIndex: Joi.number().integer().min(0).required().messages({
    'any.required': 'Lesson order index is required',
  }),
});

// ------------------- CHAPTER -------------------
const chapterSchema = Joi.object({
  _id: objectId.optional(),
  moduleId: objectId.optional(), 
  title: Joi.string().required().messages({
    'any.required': 'Chapter title is required',
  }),
  orderIndex: Joi.number().integer().min(0).required().messages({
    'any.required': 'Chapter order index is required',
  }),
  lessons: Joi.array().items(lessonSchema).min(1).required().messages({
    'any.required': 'Lesson is required',
    'array.min': 'Each chapter must have at least one lesson',
  }),
});

// ------------------- MODULE -------------------
const moduleSchema = Joi.object({
  _id: objectId.optional(),
  courseId: objectId.optional(),
  title: Joi.string().required().messages({
    'any.required': 'Module title is required',
  }),
  orderIndex: Joi.number().integer().min(0).required().messages({
    'any.required': 'Module order index is required',
  }),
  chapters: Joi.array().items(chapterSchema).min(1).required().messages({
    'array.min': 'Each module must have at least one chapter',
  }),
});

// ------------------- COURSE -------------------
const updateCourseSchema = Joi.object({
  title: Joi.string().required().messages({
    'any.required': 'Course title is required',
  }),
  description: Joi.string().allow('').optional(),
  createdBy: objectId.required().messages({
    'any.required': 'CreatedBy (User ID) is required',
  }),
  status: Joi.boolean().required().messages({
    'any.required': 'Status is required',
  }),
  modules: Joi.array().items(moduleSchema).min(1).required().messages({
    'array.min': 'At least one module is required',
  }),
});

module.exports = {
  updateCourseSchema,
};
