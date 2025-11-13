// utils/bcrypt.js
const bcrypt = require("bcrypt");

exports.hash = async (plain) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plain, salt);
};

exports.compare = async (plain, hash) => {
  return bcrypt.compare(plain, hash);
};