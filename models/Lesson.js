const mongoose = require('mongoose');

const LessonSchema = new mongoose.Schema({
  chapterId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Chapter' },
  title: { type: String, required: [true,"Title is required"] },
  orderIndex: { type: Number, required: [true,"Order is required"] },
  contentType: { type: String, required: [true,"Content type is required"] },
  contentURL: { type: String, required: [true,"Content Url is required"] },
  duration: { type: Number, required: [true,"Duration is required"] } // in seconds
},{timestamps:true});

module.exports = mongoose.model('Lesson', LessonSchema);
