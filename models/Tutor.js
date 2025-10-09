const mongoose = require('mongoose');

const tutorSchema = new mongoose.Schema(
  {
    userId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      required: true 
    },
    profile_image:{type: String},
    status:{
      type:Boolean,
      default: true
    },
    courseIds: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Course",
          required: true
        }
      ],
      validate: {
        validator: function (v) {
          return Array.isArray(v) && v.length > 0;
        },
        message: "At least one courseId is required"
      }
    }
  }, 
  { timestamps: true }
);

module.exports = mongoose.model('Tutor', tutorSchema);
