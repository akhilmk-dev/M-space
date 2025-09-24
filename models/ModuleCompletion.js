const mongoose = require("mongoose");

const moduleCompletionSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: [true,"studentId is required"],
    },
    moduleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Module",
      required: [true,"moduleId is required"],
    },
    status: {
      type: String,
      enum: ["inprogress", "completed"],
      default: "inprogress",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ModuleCompletion", moduleCompletionSchema);
