const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const validateMiddleware = require('../utils/validate');
const { registerSchema, loginSchema, refreshTokenSchema } = require('../validations/authValidation');

// POST /api/V1/auth/register
// router.post('/register',validateMiddleware(registerSchema), authController.register);

// POST /api/V1/auth/login
router.post('/login',validateMiddleware(loginSchema),  authController.login);

// POST /api/V1/auth/refresh-token
router.post('/refresh-token',validateMiddleware(refreshTokenSchema),  authController.refresh);


module.exports = router;
