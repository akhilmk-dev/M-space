const Joi = require("joi");
const mongoose = require("mongoose");

const moduleValidationSchema = Joi.object({
  courseId: Joi.string()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.error("any.invalid");
      }
      return value;
    }, "ObjectId validation")
    .required()
    .messages({
      "any.required": "Course is required",
      "any.invalid": "Invalid Course ID",
    }),

  title: Joi.string().trim().required().messages({
    "string.empty": "Title is required",
    "any.required": "Title is required",
  }),

  thumbnail: Joi.string().trim().required().messages({
    "string.empty": "Thumbnail is required",
    "any.required": "Thumbnail is required",
  }),

  orderIndex: Joi.number().integer().required().messages({
    "number.base": "Order must be a number",
    "any.required": "Order is required",
  }),
});

module.exports = moduleValidationSchema;
