const jwt = require('jsonwebtoken');

const generateAccessToken = (user,role) => {
  return jwt.sign({ id: user._id,role }, process.env.JWT_SECRET, {
    expiresIn: process.env.ACCESS_TOKEN_EXPIRY,
  });
};

const generateRefreshToken = (user,role) => {
  return jwt.sign({ id: user._id,role }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRY,
  });
};

module.exports = { generateAccessToken, generateRefreshToken };
