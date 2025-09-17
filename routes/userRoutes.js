// routes/roleRoutes.js
const express = require('express');
const router = express.Router();
const validateMiddleware = require('../utils/validate');
const { createUser, getUsers } = require('../controllers/userController');
const { authenticate } = require('../middleware/authMiddleware');
const { registerSchema } = require('../validations/authValidation');

router.post('/',authenticate, createUser);
router.get('/',authenticate, getUsers);

module.exports = router;
