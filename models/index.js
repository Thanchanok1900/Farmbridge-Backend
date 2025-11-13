const { Sequelize } = require('sequelize');
const fs = require('fs');
const path = require('path');
require('dotenv').config(); // โหลด environment variables จาก .env

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: false,
  }
);

const db = { sequelize, Sequelize };

// load model files
const files = fs.readdirSync(__dirname).filter(f => f !== 'index.js' && f.endsWith('.js'));
for (const file of files) {
  const model = require(path.join(__dirname, file))(sequelize, Sequelize.DataTypes);
  db[model.name] = model;
}

// Associations
if (db.Listings && db.Farmers) {
  db.Listings.belongsTo(db.Farmers, { foreignKey: 'seller_id', as: 'seller' });
  db.Farmers.hasMany(db.Listings, { foreignKey: 'seller_id', as: 'listings' });
}

module.exports = db;
