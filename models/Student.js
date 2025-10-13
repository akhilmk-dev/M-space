const mongoose = require("mongoose");

const StudentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course", 
  },
  profile_image:{type: String},
  enrollmentDate: {
    type: Date,
    default: Date.now,
  },
  status:{
    type:Boolean,
    default: true
  },
  mode: {
    type: String,
    required: [true,"mode is required"]
  }
});

module.exports =  mongoose.model("Student", StudentSchema);
