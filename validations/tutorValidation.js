import Joi from "joi";

// Add Tutor
export const addTutorSchema = Joi.object({
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
  courseIds: Joi.array().items(Joi.string().required()).min(1).required().messages({
    "array.min": "At least one course must be selected",
  }),
  roleId:Joi.string()
});

// Update Tutor (password optional)
export const updateTutorSchema = Joi.object({
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
  password: Joi.string().min(6).allow("").messages({
    "string.min": "Password must be at least 6 characters",
  }),
  courses: Joi.array().items(Joi.string().required()).min(1).required().messages({
    "array.min": "At least one course must be selected",
  }),
});
