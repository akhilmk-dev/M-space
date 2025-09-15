// routes/roleRoutes.js
const express = require('express');
const router = express.Router();
const roleController = require('../controllers/roleController');
const validateMiddleware = require('../utils/validate');
const { roleValidationSchema } = require('../validations/roleValidation');
const { authenticate } = require('../middleware/authMiddleware');

router.post('/',authenticate,validateMiddleware(roleValidationSchema), roleController.createRole);
router.get('/',authenticate, roleController.getAllRoles);
router.get('/:id',authenticate, roleController.getRoleById);
router.put('/:roleId',validateMiddleware(roleValidationSchema), roleController.updateRole);
router.delete('/:id', roleController.deleteRole);

module.exports = router;
