const mongoose = require("mongoose");
const User = require("../models/User");
const Course = require("../models/Course");
const Tutor = require("../models/Tutor");
const Roles = require("../models/Roles");
const bcrypt = require("bcrypt");
const {
    BadRequestError,
    NotFoundError,
    ConflictError,
    InternalServerError,
    ForbiddenError,
} = require("../utils/customErrors");
const checkDependencies = require("../helper/checkDependencies");
const { uploadBase64ToS3 } = require("../utils/s3Uploader");
const hasPermission = require("../helper/hasPermission");

// Create tutor
async function createTutor(req, res, next) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const isPermission = await hasPermission(req.user?.id, "Add Tutor");
    if (!isPermission ) {
      throw new ForbiddenError("User Doesn't have permission to create tutor")
    }
    const { name, email, phone, password, courseIds, profile_image,status=true } = req.body;

    if (!name || !email || !phone || !password || !courseIds || !courseIds.length) {
      throw new BadRequestError("All fields are required, including at least one courseId.");
    }

    // Check if user exists
    const existingUser = await User.findOne({ email }).session(session);
    if (existingUser) {
      throw new ConflictError("Email already in use.");
    }

    // Find tutor role
    const tutorRole = await Roles.findOne({ role_name: /tutor/i }).session(session);
    if (!tutorRole) {
      throw new NotFoundError("Tutor role not found.");
    }

    // Validate each course
    for (const courseId of courseIds) {
      if (!mongoose.Types.ObjectId.isValid(courseId)) {
        throw new BadRequestError(`Invalid Course ID: ${courseId}`);
      }
      const course = await Course.findById(courseId).session(session);
      if (!course) {
        throw new NotFoundError(`Course not found: ${courseId}`);
      }
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Upload profile image if provided
    let profileImageUrl = null;
    if (profile_image) {
      const isBase64 = /^data:image\/(png|jpeg|jpg|gif);base64,/.test(profile_image);
      const isUrl = /^https?:\/\//i.test(profile_image);

      if (isBase64) {
        try {
          profileImageUrl = await uploadBase64ToS3(profile_image, "tutor-profiles");
        } catch (err) {
          throw new BadRequestError("Error uploading profile image to S3: " + err.message);
        }
      } else if (isUrl) {
        profileImageUrl = profile_image; 
      } else {
        throw new BadRequestError("Invalid profile image format. Must be base64 or https URL.");
      }
    }

    // Create user
    const userDocs = await User.create(
      [
        {
          name,
          email,
          phone,
          passwordHash,
          roleId: tutorRole._id,
          status: true,
        },
      ],
      { session }
    );
    const user = userDocs[0];

    // Create tutor record
    await Tutor.create(
      [
        {
          userId: user._id,
          courseIds,
          profile_image: profileImageUrl,
          status:status
        },
      ],
      { session }
    );

    // Fetch course details for response
    let courses = [];
    if (courseIds?.length) {
      const courseDocs = await Course.find({ _id: { $in: courseIds } }).lean();
      courses = courseDocs.map((c) => ({
        id: c._id,
        title: c.title,
      }));
    }

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      message: "Tutor created successfully.",
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        profileImage: profileImageUrl,
        courses,
        status:status
      },
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
}

// List tutors with pagination & search
async function listTutors(req, res, next) {
    try {
      const isPermission = await hasPermission(req.user?.id, "List Tutor");
      if (!isPermission ) {
        throw new ForbiddenError("User Doesn't have permission to list tutor")
      }
      // Pagination
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
  
      // Search
      const search = req.query.search || '';
      const searchRegex = new RegExp(search, 'i');
  
      // Sort (field:direction)
      let sortField = 'createdAt';
      let sortOrder = -1; // default: descending
  
      if (req.query.sortBy) {
        const [field, order] = req.query.sortBy.split(':');
        sortField = field || 'createdAt';
        sortOrder = order === 'asc' ? 1 : -1;
      }
  
      // Tutor role
      const tutorRole = await Roles.findOne({ role_name: /tutor/i });
      if (!tutorRole) {
        throw new NotFoundError('Tutor role not found.');
      }
  
      // Match query
      const match = {
        roleId: tutorRole._id,
        $or: [
          { name: { $regex: searchRegex } },
          { email: { $regex: searchRegex } },
          { phone: { $regex: searchRegex } },
        ],
      };
  
      // Count
      const total = await User.countDocuments(match);
  
      // Fetch
      const users = await User.find(match)
        .populate('roleId', 'role_name')
        .sort({ [sortField]: sortOrder })
        .collation({ locale: "en", strength: 2 })
        .skip(skip)
        .limit(limit)
        .lean();
  
      // Enrich tutors
      const tutors = await Promise.all(
        users.map(async (u) => {
          const tutorInfo = await Tutor.findOne({ userId: u._id }).lean();
          let courses = [];
          if (tutorInfo && tutorInfo.courseIds.length) {
            courses = await Course.find({ _id: { $in: tutorInfo.courseIds } }).lean();
          }
          return {
            id: u._id,
            name: u.name,
            email: u.email,
            phone: u.phone,
            role: u.roleId.role_name,
            courses: courses.map((c) => ({ id: c._id, title: c.title })),
            profile_image: tutorInfo?.profile_image || null
          };
        })
      );
  
      // Response
      res.json({
        status: 'success',
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        data: tutors,
      });
    } catch (err) {
      next(err);
    }
}
  
// Update tutor
async function updateTutor(req, res, next) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const isPermission = await hasPermission(req.user?.id, "Edit Tutor");
    if (!isPermission ) {
      throw new ForbiddenError("User Doesn't have permission to edit tutor")
    }
    const { tutorId } = req.params;
    const { name, email, phone, courseIds, profile_image } = req.body;

    // Validate tutor ID
    if (!mongoose.Types.ObjectId.isValid(tutorId)) {
      throw new BadRequestError("Invalid tutor ID");
    }

    const user = await User.findById(tutorId).session(session);
    if (!user) {
      throw new NotFoundError("User not found");
    }

    // Check role
    const role = await Roles.findById(user.roleId).session(session);
    if (!role || !/tutor/i.test(role.role_name)) {
      throw new BadRequestError("User is not a tutor");
    }

    // Validate and check all courses if provided
    if (courseIds && courseIds.length) {
      for (const courseId of courseIds) {
        if (!mongoose.Types.ObjectId.isValid(courseId)) {
          throw new BadRequestError(`Invalid course ID: ${courseId}`);
        }
        const course = await Course.findById(courseId).session(session);
        if (!course) {
          throw new NotFoundError(`Course not found: ${courseId}`);
        }
      }
    }

    // Update user details
    if (name) user.name = name;
    if (email) {
      const existing = await User.findOne({ email, _id: { $ne: tutorId } }).session(session);
      if (existing) {
        throw new ConflictError("Email already in use by another user");
      }
      user.email = email;
    }
    if (phone) user.phone = phone;

    await user.save({ session });

    // Find Tutor record
    let tutorInfo = await Tutor.findOne({ userId: tutorId }).session(session);
    if (!tutorInfo) {
      tutorInfo = await Tutor.create([{ userId: tutorId, courseIds }], { session });
    } else {
      // Profile image logic
      if (profile_image) {
        const isBase64 = /^data:image\/(png|jpeg|jpg|gif);base64,/.test(profile_image);
        const isUrl = /^https?:\/\//i.test(profile_image);

        if (isBase64) {
          try {
            const uploadedUrl = await uploadBase64ToS3(profile_image, "tutor-profiles");
            tutorInfo.profile_image = uploadedUrl;
          } catch (err) {
            throw new BadRequestError("Error uploading profile image to S3: " + err.message);
          }
        } else if (!isUrl && profile_image.trim() !== "") {
          throw new BadRequestError("Invalid profile image format. Must be base64 or https URL.");
        }
        // If URL or null, we do not modify the profile_image
      }

      if (courseIds && courseIds.length) tutorInfo.courseIds = courseIds;
      await tutorInfo.save({ session });
    }

    // Get updated tutor info for response
    const tutorRecord = await Tutor.findOne({ userId: tutorId }).lean();
    let courses = [];

    if (tutorRecord?.courseIds?.length) {
      const courseDocs = await Course.find({ _id: { $in: tutorRecord.courseIds } }).lean();
      courses = courseDocs.map((c) => ({
        id: c._id,
        title: c.title,
      }));
    }

    await session.commitTransaction();
    session.endSession();

    res.json({
      message: "Tutor updated successfully",
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: role?.role_name,
        profileImage: tutorRecord?.profile_image,
        courses,
      },
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
}

// Delete tutor
async function deleteTutor(req, res, next) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const isPermission = await hasPermission(req.user?.id, "Delete Tutor");
    if (!isPermission ) {
      throw new ForbiddenError("User Doesn't have permission to delete tutor")
    }
    const { tutorId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(tutorId)) {
      throw new BadRequestError("Invalid tutor ID");
    }

    const user = await User.findById(tutorId).session(session);
    if (!user) {
      throw new NotFoundError("User not found");
    }

    // Check role is tutor
    const role = await Roles.findById(user.roleId).session(session);
    if (!role || !/tutor/i.test(role.role_name)) {
      throw new BadRequestError("User is not a tutor");
    }

    // Prevent deletion if dependencies exist
    await checkDependencies("Tutor", user._id, [
      "tutorId",
      "createdBy",
      "uploadedBy",
      "answeredBy"
    ]);

    //  Delete Tutor record
    await Tutor.deleteOne({ userId: tutorId }).session(session);

    // Delete User record
    await User.deleteOne({ _id: tutorId }).session(session);

    await session.commitTransaction();
    session.endSession();

    res.json({
      status: "success",
      message: "Tutor deleted successfully",
      data: user,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
}

// Get tutors by courseId
async function getTutorsByCourseId(req, res, next) {
    try {
        const { courseId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(courseId)) {
            throw new BadRequestError("Invalid Course ID");
        }

        const course = await Course.findById(courseId);
        if (!course) {
            throw new NotFoundError("Course not found.");
        }

        const tutors = await Tutor.find({ courseIds: courseId })
            .populate("userId", "name email phone status createdAt")
            .lean();

        const result = tutors.map((t) => ({
            _id: t.userId?._id,
            name: t.userId?.name,
            email: t.userId?.email,
        }));

        res.status(200).json({
            message: "Tutors fetched successfully",
            course: {
                id: course._id,
                title: course.title,
            },
            total: result.length,
            tutors: result,
        });
    } catch (err) {
        next(err);
    }
}

const changeTutorPassword = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = req.user.id; 
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      throw new BadRequestError("Both old and new passwords are required");
    }

    // Fetch user
    const user = await User.findById(userId).populate("roleId").session(session);
    if (!user) {
      throw new NotFoundError("User not found");
    }

    //Verify user is a tutor
    const role = user?.roleId?.role_name?.toLowerCase();
    if (role !== "tutor") {
      throw new InternalServerError("Tutor not found");
    }

    // Verify old password
    const isMatch = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isMatch) {
      throw new InternalServerError("Old password is incorrect");
    }

    // Check that old and new passwords are not the same
    const isSamePassword = await bcrypt.compare(newPassword, user.passwordHash);
    if (isSamePassword) {
      throw new InternalServerError("New password cannot be the same as the old password");
    }

    // Hash and update new password
    const newHashedPassword = await bcrypt.hash(newPassword, 10);
    user.passwordHash = newHashedPassword;
    await user.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      status: "success",
      message: "Password changed successfully",
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

const updateTutorProfile = async(req, res, next) =>{
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const tutorId = req.user.id;
    const { name, email, phone, courseIds, profile_image } = req.body;

    if (!mongoose.Types.ObjectId.isValid(tutorId)) {
      throw new BadRequestError("Invalid tutor ID");
    }

    const user = await User.findById(tutorId).session(session);
    if (!user) throw new NotFoundError("User not found");

    const role = await Roles.findById(user.roleId).session(session);
    if (!role || !/tutor/i.test(role.role_name)) {
      throw new ForbiddenError("User is not a tutor");
    }

    // Validate courses
    if (courseIds && courseIds.length) {
      for (const courseId of courseIds) {
        if (!mongoose.Types.ObjectId.isValid(courseId)) {
          throw new BadRequestError(`Invalid course ID: ${courseId}`);
        }
        const course = await Course.findById(courseId).session(session);
        if (!course) throw new NotFoundError(`Course not found: ${courseId}`);
      }
    }

    // Update basic user info
    if (name) user.name = name;
    if (email) {
      const existing = await User.findOne({ email, _id: { $ne: tutorId } }).session(session);
      if (existing) throw new ConflictError("Email already in use by another user");
      user.email = email;
    }
    if (phone) user.phone = phone;

    await user.save({ session });

    // Update Tutor record
    let tutorInfo = await Tutor.findOne({ userId: tutorId }).session(session);
    if (!tutorInfo) {
      tutorInfo = await Tutor.create([{ userId: tutorId, courseIds }], { session });
    } else {
      // Handle profile image
      if (profile_image) {
        const isBase64 = /^data:image\/(png|jpeg|jpg|gif);base64,/.test(profile_image);
        const isUrl = /^https?:\/\//i.test(profile_image);

        if (isBase64) {
          try {
            const uploadedUrl = await uploadBase64ToS3(profile_image, "tutor-profiles");
            tutorInfo.profile_image = uploadedUrl;
          } catch (err) {
            throw new BadRequestError("Error uploading profile image to S3: " + err.message);
          }
        } else if (!isUrl && profile_image.trim() !== "") {
          throw new BadRequestError("Invalid profile image format. Must be base64 or https URL.");
        }
      }

      if (courseIds && courseIds.length) tutorInfo.courseIds = courseIds;
      await tutorInfo.save({ session });
    }

    // Prepare response
    const tutorRecord = await Tutor.findOne({ userId: tutorId }).lean();
    let courses = [];

    if (tutorRecord?.courseIds?.length) {
      const courseDocs = await Course.find({ _id: { $in: tutorRecord.courseIds } }).lean();
      courses = courseDocs.map((c) => ({
        id: c._id,
        title: c.title,
      }));
    }

    await session.commitTransaction();
    session.endSession();

    res.json({
      message: "Profile updated successfully",
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: role?.role_name,
        profileImage: tutorRecord?.profile_image,
        courses,
      },
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
}


module.exports = {
    createTutor,
    listTutors,
    updateTutor,
    deleteTutor,
    getTutorsByCourseId,
    changeTutorPassword,
    updateTutorProfile
};
