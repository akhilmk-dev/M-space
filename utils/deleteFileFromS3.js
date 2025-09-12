const AWS = require("aws-sdk");

const deleteFileFromS3 = async (fileUrl) => {
    const s3 = new AWS.S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION,
    });
    const urlParts = fileUrl.split("/");
    const bucket = process.env.AWS_BUCKET_NAME;
    const key = urlParts.slice(3).join("/"); // Assuming the key starts after 3rd segment

    const params = { Bucket: bucket, Key: key };

    try {
        await s3.deleteObject(params).promise();
    } catch (err) {
        console.error("Failed to delete file from S3:", fileUrl, err);
        // Optionally: throw error or ignore
    }
};

module.exports = { deleteFileFromS3 };
