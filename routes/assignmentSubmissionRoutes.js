// routes/roleRoutes.js
const express = require('express');
const router = express.Router();
const validateMiddleware = require('../utils/validate');
const { authenticate } = require('../middleware/authMiddleware');
const { submitAssignment, getAllSubmissions, getSubmissionsByStudent, getSubmissionById, reviewAssignment } = require('../controllers/assignmentSubmissions');
const { submitAssignmentSchema, reviewAssignmentSchema } = require('../validations/assignmentSubmissionValidation');

router.put('/:assignmentId',authenticate,validateMiddleware(submitAssignmentSchema), submitAssignment);
router.get('/:studentId',authenticate,getSubmissionsByStudent)
router.get('/',authenticate, getAllSubmissions);
router.get("/submissions/:submissionId",authenticate, getSubmissionById);
router.put('/review/:assignmentId',authenticate,validateMiddleware(reviewAssignmentSchema),reviewAssignment);



module.exports = router;
