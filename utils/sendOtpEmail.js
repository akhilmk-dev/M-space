// utils/sendOtpEmail.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: "akhilmk.js@gmail.com",
    pass: "akhil@1020"
  }
});

async function sendOtpEmail(to, otp) {
  await transporter.sendMail({
    from: "akhilmk.js@gmail.com",
    to,
    subject: 'Your OTP Code',
    text: `Your password reset OTP is ${otp}. It expires in 2 minutes.`,
  });
}

module.exports = sendOtpEmail;
