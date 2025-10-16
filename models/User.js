const mongoose = require("mongoose");

const options = {
  discriminatorKey: 'kind', // required for discriminators
  timestamps: true,
};

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
    otpCode: String,
    otpExpiresAt: Date,
    otpVerified: { type: Boolean, default: false }
  },
  options,
  { timestamps: true }
);

UserSchema.virtual("studentProfile", {
  ref: "Student",
  localField: "_id", 
  foreignField: "userId", 
  justOne: true,
});

UserSchema.set("toObject", { virtuals: true });
UserSchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("User", UserSchema);
