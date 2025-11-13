const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const DashboardMetrics = sequelize.define('DashboardMetrics', {
    total_sales_value: DataTypes.DECIMAL(12, 2),
    total_transactions: DataTypes.INTEGER,
    average_price: DataTypes.DECIMAL(10, 2),
    waste_reduced_kg: DataTypes.DECIMAL(10, 2),
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'dashboard_metrics',
    timestamps: false
  });

  return DashboardMetrics;
};
