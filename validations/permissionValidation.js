const Joi = require("joi");

const permissionSchema = Joi.object({
  permission_name: Joi.string()
    .min(1)
    .required()
    .messages({
      "string.base": "Permission name must be a string",
      "string.empty": "Permission name is required",
      "any.required": "Permission name is required",
    }),

  page_url: Joi.string()
    .pattern(/^\/.*/)
    .required()
    .messages({
      "string.base": "Page URL must be a string",
      "string.empty": "Page URL is required",
      "string.pattern.base": 'Page URL must start with "/"',
      "any.required": "Page URL is required",
    }),

  group: Joi.alternatives()
    .try(
      Joi.string().required().min(1),
      Joi.valid(null).default("") // Handles optional or null group
    )
    .messages({
      "string.base": "Group must be a string",
      "string.empty": "Group is required",
      "any.required": "Group is required",
    }),
});

module.exports = permissionSchema;
