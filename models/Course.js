const mongoose = require('mongoose');

const CourseSchema = new mongoose.Schema({
  title: { type: String, required: [true, "Title is required"] },
  thumbnail: {type:String,required:[true,"Thumbnail is required"]},
  description: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: Boolean, default: true },
}, { timestamps: true });

// Safe export to prevent OverwriteModelError
module.exports = mongoose.models.Course || mongoose.model('Course', CourseSchema);
