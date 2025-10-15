const mongoose = require("mongoose");
const Notification = require("../models/Notification"); // adjust path
const Student = require("../models/Student");
const { InternalServerError,BadRequestError } = require("../utils/customErrors");
const Tutor = require("../models/Tutor");

exports.getStudentNotifications = async (req, res, next) => {
  try {
    const userId  = req.user.id;
    const { search = "", page = 1, limit = 10 } = req.query;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new BadRequestError("Invalid user ID.");
    }

    const student = await Student.findOne({userId:userId});
    if(!student)throw new InternalServerError("Student not found")

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.max(1, parseInt(limit));
    const skip = (pageNum - 1) * limitNum;

    // Build search filter
    const searchRegex = new RegExp(search, "i"); // case-insensitive
    const filter = {
      userId: new mongoose.Types.ObjectId(userId),
      $or: [
        { title: { $regex: searchRegex } },
        { message: { $regex: searchRegex } },
        { type: { $regex: searchRegex } },
      ],
    };

    // Count total notifications
    const total = await Notification.countDocuments(filter);

    // Fetch notifications with pagination
    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 }) // latest first
      .skip(skip)
      .limit(limitNum)
      .lean();

    res.status(200).json({
      success: true,
      total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      limit: limitNum,
      data: notifications,
    });
  } catch (err) {
    next(err);
  }
};

exports.getTutorNotifications = async (req, res, next) => {
    try {
      const userId  = req.user.id;
      const { search = "", page = 1, limit = 10 } = req.query;
  
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw new BadRequestError("Invalid user ID.");
      }

      const tutor = await Tutor.findOne({userId:userId});
      if(!tutor)throw new InternalServerError("Tutor not found")
  
      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.max(1, parseInt(limit));
      const skip = (pageNum - 1) * limitNum;
  
      // Build search filter
      const searchRegex = new RegExp(search, "i"); // case-insensitive
      const filter = {
        userId: new mongoose.Types.ObjectId(userId),
        $or: [
          { title: { $regex: searchRegex } },
          { message: { $regex: searchRegex } },
          { type: { $regex: searchRegex } },
        ],
      };
  
      // Count total notifications
      const total = await Notification.countDocuments(filter);
  
      // Fetch notifications with pagination
      const notifications = await Notification.find(filter)
        .sort({ createdAt: -1 }) // latest first
        .skip(skip)
        .limit(limitNum)
        .lean();
  
      res.status(200).json({
        success: true,
        total,
        totalPages: Math.ceil(total / limitNum),
        currentPage: pageNum,
        limit: limitNum,
        data: notifications,
      });
    } catch (err) {
      next(err);
    }
  };