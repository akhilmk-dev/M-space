// routes/permissionRoutes.js
const express = require('express');
const router = express.Router();
const permissionController = require('../controllers/permissionController');
const validateMiddleware = require('../utils/validate');
const { authenticate } = require('../middleware/authMiddleware');
const permissionSchema = require('../validations/permissionValidation');

router.post('/', validateMiddleware(permissionSchema), permissionController.createPermission);
router.get('/', permissionController.getPermissions);
router.get('/:id', permissionController.getPermissionById);
router.put('/:id', validateMiddleware(permissionSchema), permissionController.updatePermission);
router.delete('/:id', permissionController.deletePermission);

module.exports = router;
