const { default: mongoose } = require("mongoose");
const Attendance = require("../models/Attendance");
const Course = require("../models/Course");
const User = require("../models/User");
const { NotFoundError, ForbiddenError, BadRequestError } = require("../utils/customErrors");

exports.markAttendance = async (req, res, next) => {
    try {
      const { courseId, date, students } = req.body;
      const markedBy = req.user.id;
  
      // Basic request validation
      if (!courseId || !date || !Array.isArray(students) || students.length === 0) {
        throw new BadRequestError("courseId, date, and students are required");
      }
  
      // Validate tutor
      const tutor = await User.findById(markedBy).populate("roleId");
      if (!tutor) throw new NotFoundError("Tutor not found");
  
      if (tutor.roleId?.role_name !== "Tutor") {
        throw new ForbiddenError("You are not authorized to mark attendance");
      }
  
      // Validate course
      const course = await Course.findById(courseId);
      if (!course) throw new NotFoundError("Invalid course ID");
  
      // Validate all students
      const studentIds = students.map((s) => s.studentId);
      const validStudents = await User.find({ _id: { $in: studentIds } });
  
      if (validStudents.length !== studentIds.length) {
        // Find invalid student IDs
        const validIds = validStudents.map((s) => s._id.toString());
        const invalidIds = studentIds.filter((id) => !validIds.includes(id.toString()));
        throw new BadRequestError(`Invalid student IDs: ${invalidIds.join(", ")}`);
      }
  
      // Prepare attendance records
      const attendanceRecords = students.map((s) => ({
        courseId,
        studentId: s.studentId,
        present: s.present,
        markedBy,
        date: new Date(date),
      }));
  
      // Bulk upsert (insert or update)
      await Attendance.bulkWrite(
        attendanceRecords.map((record) => ({
          updateOne: {
            filter: {
              studentId: record.studentId,
              courseId: record.courseId,
              date: record.date,
            },
            update: { $set: record },
            upsert: true,
          },
        }))
      );
  
      res.json({ success: true, message: "Attendance marked successfully." });
    } catch (error) {
      next(error);
    }
  };

exports.getAttendanceReport = async (req, res) => {
    try {
        const { courseId } = req.params;
        const { startDate, endDate } = req.query;

        if (!courseId || !startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: "courseId, startDate, and endDate are required",
            });
        }


        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        
        const report = await Attendance.aggregate([
          {
            $match: {
              courseId: new mongoose.Types.ObjectId(courseId),
              date: { $gte: start, $lte: end },
            },
          },
          {
            $group: {
              _id: "$studentId",
              totalDays: { $sum: 1 },
              presentDays: { $sum: { $cond: [{ $eq: ["$present", true] }, 1, 0] } },
            },
          },
          {
            $lookup: {
              from: "users", // change to your students collection
              localField: "_id",
              foreignField: "_id",
              as: "student",
            },
          },
          { $unwind: "$student" },
          {
            $project: {
              _id: 0,
              studentId: "$_id",
              studentName: "$student.name",
              totalDays: 1,
              presentDays: 1,
              attendancePercentage: {
                $round: [{ $multiply: [{ $divide: ["$presentDays", "$totalDays"] }, 100] }, 2],
              },
            },
          },
          { $sort: { studentName: 1 } },
        ]);

        res.json({ success: true, report });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};