// utils/jwt.js
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'verysecretkey';

exports.sign = (payload, opts = { expiresIn: '1d' }) => {
  return jwt.sign(payload, SECRET, opts);
};

exports.verify = (token) => {
  return jwt.verify(token, SECRET);
};
