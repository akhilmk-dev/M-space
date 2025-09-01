const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    phone: {
      type: String,
      required: true,
    },
    roleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Role",
      required: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    status: {
      type: Boolean,
      default: true, 
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);
