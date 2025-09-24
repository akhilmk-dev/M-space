const Joi = require("joi");
const mongoose = require("mongoose");

const validateLessonCompletion = Joi.object({
    lessonId: Joi.string()
      .required()
      .custom((value, helpers) => {
        if (!mongoose.Types.ObjectId.isValid(value)) {
          return helpers.message("Invalid lessonId");
        }
        return value;
      }),
    isCompleted: Joi.boolean().optional(),
  });

const lessonCurrentTime = Joi.object({
  lessonId: Joi.string()
    .required()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.message("Invalid lessonId");
      }
      return value;
    }),
  currentTime: Joi.string().trim().required().messages({
      "string.empty": "Current time is required",
      "any.required": "Current time is required",
    }),
});

module.exports = { 
  validateLessonCompletion,
  lessonCurrentTime
}
