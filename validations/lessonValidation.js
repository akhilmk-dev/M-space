const Joi = require("joi");
const mongoose = require("mongoose");

const lessonValidationSchema = Joi.object({
  courseId: Joi.string()
    .required()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.message("Invalid Course ID");
      }
      return value;
    }),

  moduleId: Joi.string()
    .required()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.message("Invalid Module ID");
      }
      return value;
    }),

  chapterId: Joi.string()
    .required()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.message("Invalid Chapter ID");
      }
      return value;
    }),

  lessons: Joi.array()
    .items(
      Joi.object({
        title: Joi.string().trim().required().messages({
          "string.empty": "Lesson title is required",
        }),
        createdBy: Joi.string().required().custom((value, helpers) => {
          if (!mongoose.Types.ObjectId.isValid(value)) {
            return helpers.message("Invalid tutor Id");
          }
          return value;
        }),
        orderIndex: Joi.number().integer().required().messages({
          "number.base": "Order index must be a number",
          "any.required": "Order index is required",
        }),
        contentType: Joi.string().valid("video", "file", "text").required().messages({
          "any.only": "Content type must be one of video, file, text",
          "any.required": "Content type is required",
        }),
        contentURL: Joi.string()
        .pattern(/^https?:\/\/[^\s]+$/) 
        .required()
        .messages({
          "string.pattern.base": "Content URL must be a valid HTTP/HTTPS URL",
          "any.required": "Content URL is required",
        }),
        duration: Joi.number().integer().min(1).optional().messages({
          "number.base": "Duration must be a number (seconds)"
        }),
      })
    )
    .min(1)
    .required()
    .messages({
      "array.base": "Lessons must be an array",
      "array.min": "At least one lesson is required",
    }),
});

module.exports = { lessonValidationSchema };
