// validations/lessonValidation.js
const Joi = require("joi");
const mongoose = require("mongoose");

const objectIdValidation = (value, helpers) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return helpers.error("any.invalid");
  }
  return value;
};

const updateLessonBodySchema = Joi.object({
  chapterId: Joi.string().custom(objectIdValidation).required().messages({
    "any.required": "ChapterId is required",
    "any.invalid": "Invalid ChapterId",
  }),
  title: Joi.string().optional(),
  orderIndex: Joi.number().integer().min(1).optional(),
  contentType: Joi.string().valid("video", "file", "text").optional(),
  contentURL: Joi.string().uri().optional(),
  duration: Joi.number().integer().min(1).optional(),
});

module.exports = { updateLessonBodySchema };
