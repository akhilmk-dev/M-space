import Joi from "joi";

// Ask Question Validation
export const askQuestionSchema = Joi.object({
  question: Joi.string().min(2).max(500).required().messages({
    "string.empty": "Question is required",
    "string.min": "Question must be at least 2 characters",
    "string.max": "Question must not exceed 500 characters",
  }),
  lessonId: Joi.string().required().messages({
    "string.empty": "Lesson ID is required",
  }),
  moduleId: Joi.string().required().messages({
    "string.empty": "Module ID is required",
  }),
  description: Joi.string().required().max(1000).messages({
    "string.empty": "Description is required",
    "string.max": "Description must not exceed 1000 characters",
  }),
});

// Answer Question Validation
export const answerQuestionSchema = Joi.object({
  answer: Joi.string().min(2).max(1000).required().messages({
    "string.empty": "Answer is required",
    "string.min": "Answer must be at least 2 characters",
    "string.max": "Answer must not exceed 1000 characters",
  }),
});
