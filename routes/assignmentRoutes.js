// routes/roleRoutes.js
const express = require('express');
const router = express.Router();
const validateMiddleware = require('../utils/validate');
const { authenticate } = require('../middleware/authMiddleware');
const { createAssignment, getAllAssignments, getAssignmentById, getAssignmentsByCreatedBy, deleteAssignment, updateAssignment } = require('../controllers/assignmentController');
const { createAssignmentSchema } = require('../validations/assignmentValidation');

router.post('/',authenticate,validateMiddleware(createAssignmentSchema), createAssignment);
router.get('/',authenticate, getAllAssignments);
router.get('/createdBy/:id',authenticate,getAssignmentsByCreatedBy)
router.get('/:id',authenticate,getAssignmentById );
router.delete('/:assignmentId',authenticate,deleteAssignment);
router.put('/:assignmentId',authenticate,updateAssignment);


module.exports = router;
