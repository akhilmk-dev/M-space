// routes/roleRoutes.js
const express = require('express');
const router = express.Router();
const roleController = require('../controllers/roleController');
const validateMiddleware = require('../utils/validate');
const { roleValidationSchema } = require('../validations/roleValidation');

router.post('/',validateMiddleware(roleValidationSchema), roleController.createRole);
router.get('/', roleController.getAllRoles);
router.get('/:id', roleController.getRoleById);
router.put('/:id',validateMiddleware(roleValidationSchema), roleController.updateRole);
router.delete('/:id', roleController.deleteRole);

module.exports = router;
