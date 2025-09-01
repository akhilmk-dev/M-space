const express = require('express');
const router = express.Router();

const {
  createCourseWithHierarchy,
  getCourseWithHierarchy,
  updateCourseWithHierarchy,
  deleteCourseWithHierarchy,
  getAllCoursesWithHierarchy,
  getCoursesByUser,
} = require('../controllers/courseController');
const validateMiddleware = require('../utils/validate');
const { courseSchema } = require('../validations/courseWithStructureValidation');
const { authenticate } = require('../middleware/authMiddleware');

router.get('/',authenticate ,getAllCoursesWithHierarchy);
router.post('/',authenticate,validateMiddleware(courseSchema), createCourseWithHierarchy);
router.get('/:courseId',authenticate, getCourseWithHierarchy);
router.put('/:courseId',authenticate,validateMiddleware(courseSchema), updateCourseWithHierarchy);
router.delete('/:courseId',authenticate, deleteCourseWithHierarchy);
router.get('/created-by/:userId',authenticate, getCoursesByUser);


module.exports = router;
