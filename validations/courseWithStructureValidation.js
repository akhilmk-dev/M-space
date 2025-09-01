const Joi = require("joi");
const mongoose = require("mongoose");

const isObjectId = (value, helpers) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return helpers.error("any.invalid");
  }
  return value;
};

const lessonSchema = Joi.object({
  title: Joi.string().required(),
  contentType: Joi.string().valid("video", "article", "quiz").required(),
  contentURL: Joi.string().uri().required(),
  duration: Joi.number().positive().required(),
  orderIndex: Joi.number().integer().min(0).required(),
});

const chapterSchema = Joi.object({
  title: Joi.string().required(),
  orderIndex: Joi.number().integer().min(0).required(),
  lessons: Joi.array().items(lessonSchema).min(1).required(),
});

const moduleSchema = Joi.object({
  title: Joi.string().required(),
  orderIndex: Joi.number().integer().min(0).required(),
  chapters: Joi.array().items(chapterSchema).min(1).required(),
});

const createCourseSchema = Joi.object({
  title: Joi.string().trim().required(),
  description: Joi.string().allow("").optional(),
  createdBy: Joi.string().custom(isObjectId, "ObjectId Validation").required(),
  status: Joi.boolean().default(true),
  modules: Joi.array().items(moduleSchema).min(1).required(),
});

module.exports = {
  createCourseSchema,
};
