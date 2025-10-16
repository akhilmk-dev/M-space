import Joi from "joi";

// Add Student
export const addStudentSchema = Joi.object({
  name: Joi.string().min(3).max(50).required().messages({
    "string.empty": "Name is required",
    "string.min": "Name must be at least 3 characters",
  }),
  email: Joi.string().email().required().messages({
    "string.empty": "Email is required",
    "string.email": "Email must be a valid email",
  }),
  phone: Joi.string()
    .pattern(/^\d{10}$/)
    .required()
    .messages({
      "string.empty": "Phone number is required",
      "string.pattern.base": "Phone number must be exactly 10 digits",
    }),
  password: Joi.string().min(6).required().messages({
    "string.empty": "Password is required",
    "string.min": "Password must be at least 6 characters",
  }),
  courseId: Joi.string().required().messages({
    "string.empty": "Course is required",
  }),
  roleId: Joi.string(),
  mode: Joi.string()
    .valid("part time", "full time")
    .required()
    .messages({
      "any.only": "Mode must be either 'part time' or 'full time'",
      "string.empty": "Mode is required",
    }),
  status: Joi.boolean(),
  profile_image: Joi.string()
    .allow(null)
    .optional()
    .custom((value, helpers) => {
      const regex = /^data:image\/(png|jpeg|jpg|gif);base64,[A-Za-z0-9+/=]+$/;
      if (!regex.test(value)) {
        return helpers.message("profile_image must be a valid base64 image string");
      }
      return value;
    }),
});

// Update Student (password optional)
export const updateStudentSchema = Joi.object({
  name: Joi.string().min(3).max(50).required().messages({
    "string.empty": "Name is required",
    "string.min": "Name must be at least 3 characters",
  }),
  email: Joi.string().email().required().messages({
    "string.empty": "Email is required",
    "string.email": "Email must be a valid email",
  }),
  phone: Joi.string()
    .pattern(/^\d{10}$/)
    .required()
    .messages({
      "string.empty": "Phone number is required",
      "string.pattern.base": "Phone number must be exactly 10 digits",
    }),
  courseId: Joi.string().required().messages({
    "string.empty": "Course is required",
  }),
  status: Joi.boolean(),
  roleId: Joi.string(),
  mode: Joi.string()
    .valid("part time", "full time")
    .required()
    .messages({
      "any.only": "Mode must be either 'part time' or 'full time'",
      "string.empty": "Mode is required",
    }),
  profile_image: Joi.string().optional().allow(null),
});
