const express = require('express');
const router = express.Router();
const moduleController = require('../controllers/moduleController');
const validateMiddleware = require('../utils/validate');
const moduleValidationSchema = require('../validations/moduleValidation');

// CRUD routes
router.post('/',validateMiddleware(moduleValidationSchema), moduleController.createModule);
router.get('/', moduleController.getAllModules);
router.get('/:moduleId', moduleController.getModuleById);
router.put('/:moduleId',validateMiddleware(moduleValidationSchema), moduleController.updateModule);
router.delete('/:moduleId', moduleController.deleteModule);

module.exports = router;
