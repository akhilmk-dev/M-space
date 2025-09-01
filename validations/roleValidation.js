// validations/roleValidation.js
const Joi = require('joi');

const roleValidationSchema = Joi.object({
  role_name: Joi.string().required(),
  permissions: Joi.array().items(Joi.string()).default([])
});

module.exports = { roleValidationSchema };
