const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  markedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // tutor
    required: true,
  },
  date: {
    type: Date,
    required: true,
    default: Date.now,
  },
  present: {
    type: Boolean,
    required: true,
    default: false,
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // student
    required: true,
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
  },
}, {
  timestamps: true,
});

const Attendance = mongoose.model('Attendance', attendanceSchema);

module.exports = Attendance;
