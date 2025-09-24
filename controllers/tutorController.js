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
} = require("../utils/customErrors");

// Create tutor
async function createTutor(req, res, next) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { name, email, phone, password, courseIds } = req.body;

        if (!name || !email || !phone || !password || !courseIds || !courseIds.length) {
            throw new BadRequestError("All fields are required, including at least one courseId.");
        }

        // check if user exists
        const existingUser = await User.findOne({ email }).session(session);
        if (existingUser) {
            throw new ConflictError("Email already in use.");
        }

        // find tutor role
        const tutorRole = await Roles.findOne({ role_name: /tutor/i }).session(session);
        if (!tutorRole) {
            throw new NotFoundError("Tutor role not found.");
        }

        // validate courses
        for (const courseId of courseIds) {
            if (!mongoose.Types.ObjectId.isValid(courseId)) {
                throw new BadRequestError(`Invalid Course ID: ${courseId}`);
            }
            const course = await Course.findById(courseId).session(session);
            if (!course) {
                throw new NotFoundError(`Course not found: ${courseId}`);
            }
        }

        // hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // create user
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

        // create tutor record
        await Tutor.create(
            [
                {
                    userId: user._id,
                    courseIds,
                },
            ],
            { session }
        );
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
                phone:user.phone,
                courses,
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
      // 1. Pagination
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
  
      // 2. Search
      const search = req.query.search || '';
      const searchRegex = new RegExp(search, 'i');
  
      // 3. Sort (field:direction)
      let sortField = 'createdAt';
      let sortOrder = -1; // default: descending
  
      if (req.query.sortBy) {
        const [field, order] = req.query.sortBy.split(':');
        sortField = field || 'createdAt';
        sortOrder = order === 'asc' ? 1 : -1;
      }
  
      // 4. Tutor role
      const tutorRole = await Roles.findOne({ role_name: /tutor/i });
      if (!tutorRole) {
        throw new NotFoundError('Tutor role not found.');
      }
  
      // 5. Match query
      const match = {
        roleId: tutorRole._id,
        $or: [
          { name: { $regex: searchRegex } },
          { email: { $regex: searchRegex } },
          { phone: { $regex: searchRegex } },
        ],
      };
  
      // 6. Count
      const total = await User.countDocuments(match);
  
      // 7. Fetch
      const users = await User.find(match)
        .populate('roleId', 'role_name')
        .sort({ [sortField]: sortOrder })
        .collation({ locale: "en", strength: 2 })
        .skip(skip)
        .limit(limit)
        .lean();
  
      // 8. Enrich tutors
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
          };
        })
      );
  
      // 9. Response
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
        const { tutorId } = req.params;
        const { name, email, phone, courseIds } = req.body;

        if (!mongoose.Types.ObjectId.isValid(tutorId)) {
            throw new BadRequestError("Invalid tutor ID");
        }

        const user = await User.findById(tutorId).session(session);
        if (!user) {
            throw new NotFoundError("User not found");
        }

        const role = await Roles.findById(user.roleId).session(session);
        if (!role || !/tutor/i.test(role.role_name)) {
            throw new BadRequestError("User is not a tutor");
        }

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

        const tutorInfo = await Tutor.findOne({ userId: tutorId }).session(session);
        if (!tutorInfo) {
            await Tutor.create([{ userId: tutorId, courseIds }], { session });
        } else {
            if (courseIds && courseIds.length) tutorInfo.courseIds = courseIds;
            await tutorInfo.save({ session });
        }

        const tutorRecord = await Tutor.findOne({ userId: tutorId }).lean();

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

        res.json({
            message: "Tutor updated successfully",
            data: {
                id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role:role?.role_name,
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
        const { tutorId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(tutorId)) {
            throw new BadRequestError("Invalid tutor ID");
        }

        const user = await User.findById(tutorId).session(session);
        if (!user) {
            throw new NotFoundError("User not found");
        }

        const role = await Roles.findById(user.roleId).session(session);
        if (!role || !/tutor/i.test(role.role_name)) {
            throw new BadRequestError("User is not a tutor");
        }

        await Tutor.deleteOne({ userId: tutorId }).session(session);
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

module.exports = {
    createTutor,
    listTutors,
    updateTutor,
    deleteTutor,
    getTutorsByCourseId,
};
