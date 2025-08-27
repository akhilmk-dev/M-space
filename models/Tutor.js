const mongoose = require('mongoose');

const tutorSchema = new mongoose.Schema({
  name: { type: String, required: [true,"Name is required"] },
  email: { type: String, unique: true, required: [true,"Email is required"] },
  password: { type: String, required: [true,"Password is required"] },
  refresh_token: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Tutor', tutorSchema);
