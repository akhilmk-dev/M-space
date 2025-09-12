const Joi = require("joi");

const base64Regex = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const submitAssignmentSchema = Joi.object({
  answer: Joi.string()
    .allow("")
    .required()
    .messages({
      "string.base": "Answer must be a string.",
      "any.required": "Answer is required.",
    }),

  submissionLink: Joi.string()
    .uri()
    .allow("")
    .optional()
    .messages({
      "string.uri": "Submission link must be a valid URL.",
    }),
  submissionFiles: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().required().messages({
          "string.empty": "File name is required.",
          "any.required": "File name is required.",
        }),
        base64: Joi.string().required().messages({
          'string.empty': 'Base64 content is required',
          'any.required': 'Base64 content is required',
        }),
      })
    )
    .optional()
    .max(10)
    .messages({
      "array.max": "You can upload a maximum of 10 files.",
    }),
});

const reviewAssignmentSchema = Joi.object({
  mark: Joi.number()
    .min(0)
    .max(100)
    .required()
    .messages({
      "number.base": "Mark must be a number.",
      "number.min": "Mark cannot be less than 0.",
      "number.max": "Mark cannot be more than 100.",
      "any.required": "Mark is required.",
    }),

  comment: Joi.string()
    .allow("")
    .optional()
    .messages({
      "string.base": "Comment must be a string.",
    }),
});


module.exports = {
  submitAssignmentSchema,
  reviewAssignmentSchema,
};
