// middleware/upload.middleware.js
const multer = require('multer');
const path = require('path');

// ตั้งค่าที่เก็บไฟล์และชื่อไฟล์
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // เซฟลงโฟลเดอร์ public/uploads
    cb(null, 'public/uploads/');
  },
  filename: (req, file, cb) => {
    // ตั้งชื่อไฟล์ใหม่กันซ้ำ: เวลาปัจจุบัน + ตัวเลขสุ่ม + นามสกุลเดิม
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

module.exports = upload;