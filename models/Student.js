const mongoose = require("mongoose");

const StudentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course", 
  },
  enrollmentDate: {
    type: Date,
    default: Date.now,
  },
});


module.exports =  mongoose.model("Student", StudentSchema);
