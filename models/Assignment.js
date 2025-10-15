const mongoose = require("mongoose");

const FileSchema = new mongoose.Schema({
  name: String,
  size: String,
  fileUrl: String,
});

const AssignmentSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  lessonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson',required:[true,"Lesson is required"] },
  deadline: { type: Date,required:[true,"Deadline is required"] },
  files: [FileSchema],
  assignedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  status: { type: String, enum: ['Active', 'Closed'], default: 'draft' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  totalMarks: {type:Number,default:100}
}, { timestamps: true });

module.exports = mongoose.model("Assignment", AssignmentSchema);
