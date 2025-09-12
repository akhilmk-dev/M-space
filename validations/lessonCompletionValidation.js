const Joi = require("joi");
const mongoose = require("mongoose");

const validateLessonCompletion = (data) => {
  const schema = Joi.object({
    studentId: Joi.string()
      .required()
      .custom((value, helpers) => {
        if (!mongoose.Types.ObjectId.isValid(value)) {
          return helpers.message("Invalid studentId");
        }
        return value;
      }),
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

  return schema.validate(data);
};

module.exports = validateLessonCompletion;
