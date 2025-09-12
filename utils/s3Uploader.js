const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { v4: uuidv4 } = require('uuid');

const uploadBase64ToS3 = async (base64Data, folder = 'categories') => {

    const s3 = new S3Client({
        region: process.env.AWS_REGION,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      });
      const matches = base64Data.match(/^data:(.+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        throw new Error('Invalid base64 string');
      }
    
      const contentType = matches[1];
      const buffer = Buffer.from(matches[2], 'base64');
      const fileExtension = contentType.split('/')[1];
      const fileKey = `${folder}/${uuidv4()}.${fileExtension}`;
    
      const command = new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: fileKey,
        Body: buffer,
        ContentEncoding: 'base64',
        ContentType: contentType,
      });
    
      await s3.send(command);
    
      return `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;
    };
    

module.exports = {
    uploadBase64ToS3,
};
