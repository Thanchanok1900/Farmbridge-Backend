const { io } = require('socket.io-client');

const socket = io('http://localhost:3000', {
  path: '/socket.io'
});

socket.on('connect', () => {
  console.log('Connected with socket id:', socket.id);

  // ส่ง userId ไป server หลัง connect
  socket.emit('auth', { userId: 1 });
});

socket.on('notification', (data) => {
  console.log('Received notification:', data);
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
});
