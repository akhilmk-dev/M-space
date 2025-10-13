const { default: mongoose } = require("mongoose");
const Attendance = require("../models/Attendance");
const PDFDocument = require("pdfkit");
const Course = require("../models/Course");
const User = require("../models/User");
const { NotFoundError, ForbiddenError, BadRequestError } = require("../utils/customErrors");
const { uploadBase64ToS3 } = require("../utils/s3Uploader");

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
      let { startDate, endDate, page = 1, limit = 10 } = req.query;
  
      if (!courseId || !startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: "courseId, startDate, and endDate are required",
        });
      }
  
      page = parseInt(page);
      limit = parseInt(limit);
      const skip = (page - 1) * limit;
  
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
  
      // Total count of students in the report
      const totalCountResult = await Attendance.aggregate([
        {
          $match: {
            courseId: new mongoose.Types.ObjectId(courseId),
            date: { $gte: start, $lte: end },
          },
        },
        {
          $group: { _id: "$studentId" },
        },
        { $count: "total" },
      ]);
      const total = totalCountResult[0]?.total || 0;
  
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
            from: "users", // your students collection
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
              $round: [
                { $multiply: [{ $divide: ["$presentDays", "$totalDays"] }, 100] },
                2,
              ],
            },
          },
        },
        { $sort: { studentName: 1 } },
        { $skip: skip },
        { $limit: limit },
      ]);
  
      res.json({
        success: true,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        report,
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
};

exports.generateAttendanceReportPdf = async (req, res) => {
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
  
      const course = await Course.findById(courseId).select("title");
      if (!course) {
        return res.status(404).json({ success: false, message: "Course not found" });
      }
  
      // Aggregate attendance data
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
            from: "users",
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
              $cond: [
                { $eq: ["$totalDays", 0] },
                0,
                {
                  $round: [
                    {
                      $multiply: [
                        { $divide: ["$presentDays", "$totalDays"] },
                        100,
                      ],
                    },
                    2,
                  ],
                },
              ],
            },
          },
        },
        { $sort: { studentName: 1 } },
      ]);
  
      // --- Generate PDF ---
      const doc = new PDFDocument({ margin: 50 });
      const chunks = [];
  
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", async () => {
        const pdfBuffer = Buffer.concat(chunks);
        const base64PDF = `data:application/pdf;base64,${pdfBuffer.toString("base64")}`;
        const s3Url = await uploadBase64ToS3(base64PDF, "attendance-reports");
  
        return res.json({
          success: true,
          message: "Attendance report generated successfully",
          fileUrl:s3Url,
        });
      });
  
      // --- Header ---
      doc.fontSize(18).text(`Attendance Report - ${course.title}`, { align: "center" });
      doc.moveDown();
      doc.fontSize(12).text(`From: ${startDate}  To: ${endDate}`);
      doc.moveDown();
      doc.text(`Generated on: ${new Date().toLocaleString()}`);
      doc.moveDown(2);
  
      // --- Table Setup ---
      const tableTop = doc.y;
      const colWidths = [220, 100, 100, 100];
      const headers = ["Student Name", "Total Days", "Present Days", "Attendance %"];
  
      // Header Row
      let x = 50;
      doc.font("Helvetica-Bold").fontSize(12);
      headers.forEach((header, i) => {
        doc.rect(x, tableTop, colWidths[i], 25).stroke();
        doc.text(header, x + 5, tableTop + 7);
        x += colWidths[i];
      });
  
      // Data Rows
      let y = tableTop + 25;
      doc.font("Helvetica").fontSize(11);
  
      report.forEach((r) => {
        x = 50;
        const rowHeight = 25;
        const attendancePercentage = isNaN(r.attendancePercentage)
          ? 0
          : r.attendancePercentage;
  
        const rowValues = [
          r.studentName || "N/A",
          String(r.totalDays || 0),
          String(r.presentDays || 0),
          `${attendancePercentage}%`,
        ];
  
        rowValues.forEach((text, i) => {
          doc.rect(x, y, colWidths[i], rowHeight).stroke();
          doc.text(text, x + 5, y + 8, {
            width: colWidths[i] - 10,
            align: i === 0 ? "left" : "center",
          });
          x += colWidths[i];
        });
  
        y += rowHeight;
  
        // Add new page if overflowing
        if (y > doc.page.height - 100) {
          doc.addPage();
          y = 50;
        }
      });
  
      doc.end();
    } catch (error) {
      console.error("Error generating attendance report:", error);
      res.status(500).json({ success: false, message: error.message });
    }
};
  
exports.getAllAttendance = async (req, res, next) => {
  try {
    // Check permission
    // const isPermission = req.user?.permissions?.includes("list_tutor");
    // if (!isPermission) {
    //   throw new ForbiddenError("User doesn't have permission to list tutor");
    // }

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Search
    const search = req.query.search || "";
    const searchRegex = new RegExp(search, "i");

    // Sorting
    let sortField = "createdAt";
    let sortOrder = -1; // default: descending
    if (req.query.sortBy) {
      const [field, order] = req.query.sortBy.split(":");
      sortField = field || "createdAt";
      sortOrder = order === "asc" ? 1 : -1;
    }

    const { courseId, startDate, endDate } = req.query;

    // Build date filter
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.date = {
        $gte: new Date(startDate),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
      };
    }

    // Build match stage
    const matchStage = {};
    if (courseId && mongoose.Types.ObjectId.isValid(courseId)) {
      matchStage.courseId = new mongoose.Types.ObjectId(courseId);
    }
    if (Object.keys(dateFilter).length > 0) {
      matchStage.date = dateFilter.date;
    }

    // Base aggregation
    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: "$studentId",
          totalDays: { $sum: 1 },
          presentDays: { $sum: { $cond: [{ $eq: ["$present", true] }, 1, 0] } },
        },
      },
      {
        $lookup: {
          from: "users",
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
          studentEmail: "$student.email",
          totalDays: 1,
          presentDays: 1,
          attendancePercentage: {
            $cond: [
              { $eq: ["$totalDays", 0] },
              0,
              {
                $round: [
                  { $multiply: [{ $divide: ["$presentDays", "$totalDays"] }, 100] },
                  2,
                ],
              },
            ],
          },
        },
      },
      // Apply search filter
      {
        $match: {
          studentName: { $regex: searchRegex },
        },
      },
      { $sort: { [sortField]: sortOrder } },
      { $skip: skip },
      { $limit: limit },
    ];

    // Count total results before pagination
    const totalResults = await Attendance.aggregate([
      { $match: matchStage },
      {
        $group: { _id: "$studentId" },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "student",
        },
      },
      { $unwind: "$student" },
      { $match: { studentName: { $regex: searchRegex } } },
      { $count: "total" },
    ]);
    const total = totalResults[0]?.total || 0;

    // Run aggregation
    const report = await Attendance.aggregate(pipeline);

    // Optional course name
    let courseName = null;
    if (courseId) {
      const course = await Course.findById(courseId).select("title");
      courseName = course?.title || null;
    }

    res.status(200).json({
      status: "success",
      total, totalPages: Math.ceil(total / limit), currentPage: page, limit,
      courseName,
      data: report,
    });
  } catch (error) {
    next(error);
  }
};

  
  
  
  
  
  