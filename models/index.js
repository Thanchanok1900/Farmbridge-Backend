// models/index.js
const { Sequelize } = require('sequelize');
const fs = require('fs');
const path = require('path');
require('dotenv').config(); 

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

// Load all models
const files = fs.readdirSync(__dirname).filter(f => f !== 'index.js' && f.endsWith('.js'));
for (const file of files) {
  const model = require(path.join(__dirname, file))(sequelize, Sequelize.DataTypes);
  db[model.name] = model;
}

// Automatically call associate()
Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

module.exports = db;
