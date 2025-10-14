const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const catchAsync = require('../utils/catchAsync');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const LessonCompletion = require('../models/LessonCompletion');
const Student = require('../models/Student');
const Course = require('../models/Course');
const Roles = require('../models/Roles');
const User = require('../models/User');

exports.getImageUrl = catchAsync(async (req, res) => {
    const s3 = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    const { fileName, fileType } = req.body;
  
    if (!fileName || !fileType) {
      return res.status(400).json({ error: 'fileName and fileType are required' });
    }
  
    const fileKey = `${Date.now()}-${fileName}`;
  
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: fileKey,
      ContentType: fileType,
  
    });
  
    try {
      const uploadURL = await getSignedUrl(s3, command, { expiresIn: 6000 });
      const publicUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;
      res.status(200).json({
        uploadURL,
        fileKey,
        publicUrl,
      });
    } catch (err) {
      console.error('Error generating signed URL:', err);
      res.status(500).json({ error: 'Failed to generate pre-signed URL' });
    }
});

exports.markLessonCompletion = catchAsync(async (req, res) => {
  const studentId = req.user?.id;
  const { lessonId, isCompleted = true } = req.body;

  if (!lessonId) {
    throw new BadRequestError('lessonId is required');
  }

  const updatedRecord = await LessonCompletion.findOneAndUpdate(
    { studentId, lessonId },
    { isCompleted },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.status(200).json({
    status: 'success',
    message: `Lesson marked as ${isCompleted ? 'completed' : 'not completed'}`,
    data: updatedRecord,
  });
});

// Update Lesson Current Time
exports.updateLessonCurrentTime = catchAsync(async (req, res) => {
  const studentId = req.user?.id;
  const { lessonId, currentTime } = req.body;

  if (!lessonId || currentTime == null) {
    throw new BadRequestError('lessonId and currentTime are required');
  }

  const updatedRecord = await LessonCompletion.findOneAndUpdate(
    { studentId, lessonId },
    { currentTime },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.status(200).json({
    status: 'success',
    message: 'Lesson current time updated successfully',
    data: updatedRecord,
  });
});

exports.getDashboardStats = async (req, res, next) => {
  try {
    // Total counts
    const totalStudents = await Student.countDocuments();

    // Get tutor role
    const tutorRole = await Roles.findOne({ role_name: /tutor/i }).lean();
    let totalTutors = 0;
    if (tutorRole) {
      totalTutors = await User.countDocuments({ roleId: tutorRole._id });
    } else {
      // fallback if role not found
      totalTutors = await User.countDocuments({ "role": "tutor" });
    }

    const totalCourses = await Course.countDocuments();

    // Fetch last 10 students
    const students = await Student.find()
      .sort({ enrollmentDate: -1 })
      .limit(10)
      .lean();

    const userIds = students.map(s => s.userId);
    const courseIds = students.map(s => s.courseId).filter(Boolean);

    const users = await User.find({ _id: { $in: userIds } })
      .select("_id name email phone")
      .lean();

    const courses = await Course.find({ _id: { $in: courseIds } })
      .select("_id title")
      .lean();

    const userMap = Object.fromEntries(users.map(u => [u._id.toString(), u]));
    const courseMap = Object.fromEntries(courses.map(c => [c._id.toString(), c.title]));

    const recentStudents = students
      .filter(s => userMap[s.userId?.toString()]) // only include students with valid user
      .map(s => {
        const user = userMap[s.userId.toString()];
        return {
          _id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          course: courseMap[s.courseId?.toString()] || "N/A",
          enrollmentDate: s.enrollmentDate || s.createdAt,
          mode: s.mode || "N/A",
        };
      });

    // Response
    res.status(200).json({
      success: true,
      message: "Dashboard stats fetched successfully",
      totalStudents,
      totalTutors,
      totalCourses,
      data:recentStudents
    });
  } catch (err) {
    console.error("Error fetching dashboard stats:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};


