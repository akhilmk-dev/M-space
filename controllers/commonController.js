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

exports.markLessonCompletion = async (req, res, next) => {
  try {
    // Automatically use logged-in student ID
    const studentId = req.user?.id;
    const { lessonId, isCompleted = true } = req.body;

    // Upsert (create or update) lesson completion record
    const updatedRecord = await LessonCompletion.findOneAndUpdate(
      { studentId, lessonId },
      { isCompleted },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({
      message: `Lesson marked as ${isCompleted ? "completed" : "not completed"}`,
      data: updatedRecord,
    });
  } catch (err) {
    next(err);
  }
};
