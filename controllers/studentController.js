const { default: mongoose } = require("mongoose");
const Course = require("../models/Course");
const Student = require("../models/Student");
const { BadRequestError, NotFoundError } = require("../utils/customErrors");

const getStudentsByCourseId = async (req, res, next) => {
    try {
      const { courseId } = req.params;
  
      if (!mongoose.Types.ObjectId.isValid(courseId)) {
        throw new BadRequestError("Invalid Course ID");
      }
  
      // Check if course exists
      const course = await Course.findById(courseId);
      if (!course) {
        throw new NotFoundError("Course not found.");
      }
  
      // Find students enrolled in the course
      const students = await Student.find({ courseId })
        .populate('userId', 'name email phone status createdAt')
        .lean();
  
      const result = students.map(student => ({
        userId: student.userId?._id,
        name: student.userId?.name,
      }));
  
      res.status(200).json({
        message: "Students fetched successfully",
        course: {
          id: course._id,
          title: course.title,
        },
        total: result.length,
        students: result,
      });
    } catch (err) {
      next(err);
    }
  };
  
  module.exports = getStudentsByCourseId;