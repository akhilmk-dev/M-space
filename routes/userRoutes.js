// routes/roleRoutes.js
const express = require('express');
const router = express.Router();
const validateMiddleware = require('../utils/validate');
const { createUser, getUsers, getUserById, updateUser, changePassword, deleteUserCascade } = require('../controllers/userController');
const { authenticate } = require('../middleware/authMiddleware');
const { registerSchema } = require('../validations/authValidation');

router.post('/',authenticate, createUser);
router.get('/',authenticate, getUsers);
router.get('/profile',authenticate,getUserById);
router.put('/:userId',authenticate,updateUser);
router.post('/change-password',authenticate,changePassword);
router.delete('/:userId',authenticate,deleteUserCascade)

module.exports = router;
