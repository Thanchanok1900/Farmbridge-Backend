// server.js (no socket.io)
const express = require('express');
const cors = require('cors');
const db = require('./models');
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json'); // อย่าลืมใส่ไฟล์นี้

// Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const app = express();
const path = require('path');

// อนุญาตให้เข้าถึงโฟลเดอร์ 'uploads' จากภายนอกได้
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/listings', require('./routes/listing.routes'));
app.use('/api/demands', require('./routes/demand.routes'));
app.use('/api/orders', require('./routes/order.routes'));
app.use('/api/notifications', require('./routes/notification.routes'));
app.use('/api/prices', require('./routes/price.routes'));
app.use('/api/dashboard', require('./routes/dashboard.routes'));

// Firebase admin ให้ module อื่นใช้
app.locals.firebaseAdmin = admin;

const PORT = process.env.PORT || 3000;

// Start server normally
db.sequelize.sync({ alter: true })
  .then(() => {
    console.log('✅ Database synced');
    app.listen(PORT, () =>
      console.log(`🚀 Server started on port ${PORT}`)
    );
  })
  .catch(err => {
    console.error('DB sync failed', err);
  });
