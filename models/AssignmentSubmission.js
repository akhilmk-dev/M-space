const mongoose = require("mongoose");

const FileSchema = new mongoose.Schema({
    name: String,
    size: String,
    fileUrl: String,
});

const AssignmentSubmissionSchema = new mongoose.Schema({
  assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  lessonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' },
  answer: { type: String },
  submittedAt :{type:Date},
  reviewedAt : {type:Date},
  submissionFiles: [FileSchema],
  submissionLink: { type: String },
  status: {
    type: String,
    enum: ['pending', 'submitted', 'reviewed'],
    default: 'pending',
  },
  marks: { type: Number, default: null },
  comment: {type: String}
}, { timestamps: true });

module.exports = mongoose.model("AssignmentSubmission", AssignmentSubmissionSchema);
