const mongoose = require("mongoose");

const lessonCompletionSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    lessonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lesson",
      required: true,
    },
    isCompleted: {
      type: Boolean,
      default: false,
    },
    currentTime:{
      type: String
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("LessonCompletion", lessonCompletionSchema);
