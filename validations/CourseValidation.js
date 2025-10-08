// validations/courseValidation.js
const Joi = require("joi");

const courseValidation = Joi.object({
  title: Joi.string()
    .min(3)
    .max(100)
    .required()
    .messages({
      "string.empty": "Title is required",
      "string.min": "Title must be at least 3 characters",
      "string.max": "Title cannot exceed 100 characters"
    }),
  description: Joi.string(),
  status: Joi.boolean().default(true),
  thumbnail:Joi.string().required().messages({
      "string.empty": "Thumbnail is required",
    })
});

module.exports = courseValidation;
