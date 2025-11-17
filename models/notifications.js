// models/notifications.model.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Notifications = sequelize.define('Notifications', {
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    message: DataTypes.TEXT,
    type: {
      
      type: DataTypes.ENUM(
        'match', 'payment', 'system', 'info', 
        'sale', 'order_completed' 
      ),
      allowNull: false
    },
    is_read: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },

    
    related_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },

    meta: { 
      type: DataTypes.JSONB, 
      allowNull: true
    },

    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'notifications',
    timestamps: false,
    updatedAt: false 
  });

  // ⭐️⭐️⭐️ เพิ่ม: .associate ตามมาตรฐานใหม่ ⭐️⭐️⭐️
  Notifications.associate = (models) => {
    // (ยังไม่ต้องเชื่อมโยงอะไรเป็นพิเศษ)
  };

  return Notifications;
};
