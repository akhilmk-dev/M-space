const mongoose = require('mongoose');
const Role = require('../models/Roles');
const User = require('../models/User'); // Assuming roles are used in User collection via roleId
const { roleValidationSchema } = require('../validations/roleValidation');
const { ConflictError, NotFoundError, BadRequestError } = require('../utils/customErrors');

// Utility: Check if string is a valid Mongo ObjectId
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// Utility: Protected role names
const PROTECTED_ROLE_NAMES = ['admin', 'tutor', 'student'];

// CREATE role
const createRole = async (req, res, next) => {
  try {
    const { error, value } = roleValidationSchema.validate(req.body, { abortEarly: false });
    if (error) {
      error.isJoi = true;
      throw error;
    }
    const {  role_name, permissions } = value;
    const existingRoleName = await Role.findOne({ role_name: { $regex: `^${role_name}$`, $options: 'i' } });
    if (existingRoleName) {
      throw new ConflictError("Role name already exists.");
    }
    const newRole = new Role({ role_name, permissions });
    await newRole.save();
    res.status(201).json({ message: "Role created successfully.", data: newRole });
  } catch (err) {
    next(err);
  }
};

// GET all roles
const getAllRoles = async (req, res, next) => {
  try {
    const roles = await Role.find();
    res.json({ data: roles });
  } catch (err) {
    next(err);
  }
};

// GET role by ID
const getRoleById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const role = await Role.findById(id);
    if (!role) throw new NotFoundError("Role not found.");

    res.json({ data: role });
  } catch (err) {
    next(err);
  }
};

// UPDATE role
const updateRole = async (req, res, next) => {
  try {
    const { roleId } = req.params;

    const role = await Role.findById( roleId );
    if (!role) throw new NotFoundError("Role not found.");

    // Prevent duplicate role name (case-insensitive), except for current record
    const existingName = await Role.findOne({
      role_name: { $regex: `^${req.body.role_name}$`, $options: 'i' },
      _id: { $ne: role._id },
    });
    if (existingName) {
      throw new ConflictError("Role name already exists.");
    }

    role.role_name = req.body.role_name;
    role.permissions = req.body.permissions;
    await role.save();

    res.json({ message: "Role updated successfully.", data: role });
  } catch (err) {
    next(err);
  }
};

// DELETE role
const deleteRole = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      throw new NotFoundError("Invalid Role ID.");
    }

    const role = await Role.findById(id);
    if (!role) throw new NotFoundError("Role not found.");

    // Protected names (admin, tutor, student) — case-insensitive match
    if (PROTECTED_ROLE_NAMES.includes(role.role_name.toLowerCase())) {
      throw new BadRequestError("This role cannot be deleted.");
    }

    // Check for dependencies in User collection
    const isUsed = await User.exists({ roleId: role._id });
    if (isUsed) {
      throw new BadRequestError("Role is in use and cannot be deleted.");
    }

    await Role.deleteOne({ _id: id });

    res.json({ message: "Role deleted successfully." });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createRole,
  getAllRoles,
  getRoleById,
  updateRole,
  deleteRole,
};
