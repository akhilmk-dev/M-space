// utils/checkPermission.js

const Permission = require('../models/Permission');
const Roles = require('../models/Roles');
const User = require('../models/User');
const { UnAuthorizedError, NotFoundError } = require('../utils/customErrors');

const hasPermission = async (userId, permissionName) => {
  const user = await User.findById(userId).populate('roleId');
  if(!user){
    throw new UnAuthorizedError("User not found");
  }
  const roleId = user?.roleId?._id
  if (!roleId) return false;

  // Populate role and permissions
  const role = await Roles.findById(roleId).populate('permissions');
  if (!role) return false;
  return role.permissions.some(
    (perm) => perm.permission_name == permissionName
  );
};

module.exports = hasPermission;
