const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');
const { ApiError, asyncHandler } = require('../utils/helpers');
const { validate } = require('../utils/validate');

const sign = (u) =>
  jwt.sign({ id: u.id, username: u.username, role: u.role, name: u.full_name }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

exports.login = asyncHandler(async (req, res) => {
  const { username, password } = validate(req.body, {
    username: { type: 'string', required: true, max: 60 },
    password: { type: 'string', required: true, max: 200 },
  });
  const user = await User.findByUsername(username);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) throw new ApiError(401, 'Invalid username or password');
  res.json({ token: sign(user), user: { id: user.id, username: user.username, name: user.full_name, role: user.role } });
});

exports.me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw new ApiError(401, 'Account no longer exists');
  res.json({ id: user.id, username: user.username, name: user.full_name, role: user.role });
});

exports.changePassword = asyncHandler(async (req, res) => {
  const { current_password, new_password } = validate(req.body, {
    current_password: { type: 'string', required: true },
    new_password: { type: 'string', required: true, min: 6, max: 100 },
  });
  const user = await User.findByUsername(req.user.username);
  if (!user || !(await bcrypt.compare(current_password, user.password_hash))) throw new ApiError(400, 'Current password is incorrect');
  await User.updatePassword(user.id, await bcrypt.hash(new_password, 10));
  res.json({ message: 'Password updated' });
});
