const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const catchAsync = require('../utils/catchAsync');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const LessonCompletion = require('../models/LessonCompletion');

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
    //  Count total students
    const totalStudents = await Student.countDocuments();

    // Count total tutors (using role or separate Tutor model)
    const tutorRole = await Role.findOne({ role_name: /tutor/i }).lean();
    let totalTutors = 0;
    if (tutorRole) {
      totalTutors = await User.countDocuments({ roleId: tutorRole._id });
    } else {
      // fallback if Role model not available
      totalTutors = await User.countDocuments({ "role": "tutor" });
    }

    // Count total courses
    const totalCourses = await Course.countDocuments();

    // Get last 10 registered students (with user info populated)
    const lastStudents = await Student.find()
      .populate("userId", "_id name email phone")
      .populate("courseId", "title")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // Response
    res.status(200).json({
      success: true,
      message: "Dashboard stats fetched successfully",
      data: {
        totalStudents,
        totalTutors,
        totalCourses,
        recentStudents: lastStudents.map((s) => ({
          _id: s.userId?._id,
          name: s.userId?.name,
          email: s.userId?.email,
          phone: s.userId?.phone,
          course: s.courseId?.title || "N/A",
          enrollmentDate: s.enrollmentDate,
          mode: s.mode,
        })),
      },
    });
  } catch (err) {
    console.error("Error fetching dashboard stats:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};