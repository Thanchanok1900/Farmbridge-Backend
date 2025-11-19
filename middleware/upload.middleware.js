const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ตรวจสอบว่ามีโฟลเดอร์ public/uploads หรือไม่ ถ้าไม่มีให้สร้าง
const uploadDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  // 1. กำหนดปลายทาง (Destination)
  destination: (req, file, cb) => {
    cb(null, uploadDir); // เซฟลง public/uploads
  },
  
  // 2. กำหนดชื่อไฟล์ (Filename)
  filename: (req, file, cb) => {
    // ตั้งชื่อไฟล์ให้ไม่ซ้ำกัน (เวลา + เลขสุ่ม + นามสกุลไฟล์เดิม)
    // ผลลัพธ์จะเป็นแบบในรูปของคุณ เช่น: 1763555382969-123456.jpg
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

// กรองเฉพาะไฟล์รูปภาพ (Optional)
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only images are allowed!'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // จำกัดขนาด 5MB (ปรับได้)
});

module.exports = upload;