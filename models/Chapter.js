const mongoose = require('mongoose');

const ChapterSchema = new mongoose.Schema({
  moduleId: { type: mongoose.Schema.Types.ObjectId, required: [true,"Module is required"], ref: 'Module' },
  title: { type: String, required: [true,"Title is required"] },
  orderIndex: { type: Number, required: [true,"Order is required"]}
},{timestamps:true});

module.exports = mongoose.model('Chapter', ChapterSchema);
