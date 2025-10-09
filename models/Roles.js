const mongoose = require('mongoose');

const RoleSchema = new mongoose.Schema({
  role_name: {
    type: String,
    required: [true,"role name is required"]
  },
  permissions: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Permission', 
      required: true,
    },
  ],
},{timestamps:true});

module.exports = mongoose.model('Role', RoleSchema);
