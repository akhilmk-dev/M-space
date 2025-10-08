const mongoose = require('mongoose');

const ModuleSchema = new mongoose.Schema({
  courseId: { type: mongoose.Schema.Types.ObjectId, required: [true,"Course is required"], ref: 'Course' },
  thumbnail: {type: String,required:[true,"Thumbnail is required"]},
  title: { type: String, required: [true,"Title is required"] },
  orderIndex: { type: Number, required: [true,"Order is required"] },
});

module.exports = mongoose.model('Module', ModuleSchema);
