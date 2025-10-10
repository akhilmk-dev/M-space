const express = require("express");
const { markAttendance, getAttendanceReport, generateAttendanceReportPdf } = require("../controllers/attendanceController");
const { authenticate } = require("../middleware/authMiddleware");
const { markAttendanceSchema } = require("../validations/attendanceValidation");
const validateMiddleware = require("../utils/validate");
const router = express.Router();

router.post('/mark',authenticate,validateMiddleware(markAttendanceSchema),markAttendance);
router.get('/report/:courseId',authenticate,getAttendanceReport);
router.get('/generate-attendance-report/:courseId',authenticate,generateAttendanceReportPdf)


module.exports = router;