const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PriceHistory = sequelize.define('PriceHistory', {
    product_name: DataTypes.STRING(100),
    average_price: DataTypes.DECIMAL(10, 2),
    min_price: DataTypes.DECIMAL(10, 2),
    max_price: DataTypes.DECIMAL(10, 2),
    source: DataTypes.STRING(100),
    record_date: DataTypes.DATE
  }, {
    tableName: 'price_history',
    timestamps: false
  });

  return PriceHistory;
};
