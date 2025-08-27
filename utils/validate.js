const Joi = require("joi");

function validateMiddleware(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false });

    if (!error) {
      req.body = value;
      return next();
    }

    // Format Joi errors into your desired structure
    const formattedErrors = {};
    error.details.forEach((err) => {
      const key = err.path.join(".");
      if (!formattedErrors[key]) {
        formattedErrors[key] = [];
      }
      formattedErrors[key].push(err.message.replace(/["]/g, "")); 
    });

    return res.status(400).json({
      status: "error",
      message: "Validation failed",
      errors: formattedErrors,
    });
  };
}

module.exports = validateMiddleware;
