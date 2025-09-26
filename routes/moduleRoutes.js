const express = require('express');
const router = express.Router();
const moduleController = require('../controllers/moduleController');
const validateMiddleware = require('../utils/validate');
const moduleValidationSchema = require('../validations/moduleValidation');
const { authenticate } = require('../middleware/authMiddleware');

// CRUD routes
router.post('/',authenticate, validateMiddleware(moduleValidationSchema), moduleController.createModule);
router.get('/',authenticate, moduleController.getAllModules);
router.get('/:moduleId',authenticate, moduleController.getModuleById);
router.put('/:moduleId',authenticate,validateMiddleware(moduleValidationSchema), moduleController.updateModule);
router.delete('/:moduleId',authenticate, moduleController.deleteModule);
router.get('/course/:courseId',authenticate,moduleController.getModulesByCourseId)
router.get('/dropdown/:courseId',authenticate,moduleController.getModulesForDropdown)

module.exports = router;
