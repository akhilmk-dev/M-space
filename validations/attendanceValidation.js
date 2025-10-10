const Joi = require("joi");
const mongoose = require("mongoose");

// Custom ObjectId validation helper
const objectId = () =>
  Joi.string()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.message("Invalid ObjectId format");
      }
      return value;
    })
    .required();

exports.markAttendanceSchema = Joi.object({
  courseId: objectId().label("Course ID"),
  date: Joi.date()
    .required()
    .messages({
      "any.required": "Date is required",
      "date.base": "Date must be a valid date format (YYYY-MM-DD)"
    }),
  students: Joi.array()
    .items(
      Joi.object({
        studentId: objectId().label("Student ID"),
        present: Joi.boolean()
          .required()
          .messages({
            "any.required": "Present field is required",
            "boolean.base": "Present must be a boolean value",
          }),
      })
    )
    .min(1)
    .required()
    .messages({
      "array.base": "Students must be an array",
      "array.min": "At least one student is required",
      "any.required": "Students list is required",
    }),
});
