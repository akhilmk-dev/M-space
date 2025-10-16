function errorHandler(err, req, res, next) {
  function formatMongooseErrors(err) {
    if (!err.errors) return {};
    return Object.keys(err.errors).reduce((acc, key) => {
      acc[key] = [err.errors[key].message];
      return acc;
    }, {});
  }

  // Mongoose Validation Error
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      status: 'error',
      message: "Validation failed",
      errors: formatMongooseErrors(err),
    });
  }

  // Custom Conflict Error
  if (err.name === "ConflictError") {
    return res.status(409).json({
      status: "error",
      name: "Conflict Error",
      message: err.message
    });
  }

  // Custom NotFound Error
  if (err.name === "NotFoundError") {
    return res.status(404).json({
      status: "error",
      name: "Not Found Error",
      message: err.message
    });
  }

  // Custom Error: UnAuthorizedError
  if (err.name === "UnAuthorizedError") {
    return res.status(401).json({
      status: "error",
      name: "Unauthorized Error",
      message: err.message,
    });
  }

  // forbidden error
  if (err.name === "ForbiddenError") {
    return res.status(403).json({
      status: "error",
      name: "Forbidden Error",
      message: err.message,
    });
  }

  // // Zod Validation Error
  // if (err.name === 'ZodError') {
  //   const formattedErrors = err.errors.reduce((acc, e) => {
  //     const field = e.path.length ? e.path.join('.') : '_';
  //     if (!acc[field]) acc[field] = [];
  //     acc[field].push(e.message);
  //     return acc;
  //   }, {});

  //   return res.status(400).json({
  //     status: 'error',
  //     message: 'Validation failed',
  //     errors: formattedErrors,
  //   });
  // }

  // Joi Validation Error
  if (err.isJoi) {
    const formattedErrors = err.details.reduce((acc, detail) => {
      const field = detail.path.join('.') || '_';
      if (!acc[field]) acc[field] = [];
      acc[field].push(detail.message);
      return acc;
    }, {});

    return res.status(400).json({
      status: 'error',
      message: 'Validation failed',
      errors: formattedErrors,
    });
  }

  // Fallback Error
  res.status(err.statusCode || 500).json({
    status: 'error',
    message: err.message || 'Internal Server Error',
    error:err
  });
}

module.exports = errorHandler;
