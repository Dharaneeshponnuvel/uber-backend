let connectedUsers = new Map();

export const initializeSocket = (io) => {
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // User joins with their ID and type
    socket.on('join', (userData) => {
      connectedUsers.set(socket.id, userData);
      socket.join(`${userData.userType}-${userData.userId}`);
      
      if (userData.userType === 'driver') {
        socket.join('drivers');
      } else if (userData.userType === 'rider') {
        socket.join(`rider-${userData.userId}`);
      }
      
      console.log(`${userData.userType} ${userData.userId} joined`);
    });

    // Handle driver location updates
    socket.on('update-location', async (locationData) => {
      const user = connectedUsers.get(socket.id);
      if (user && user.userType === 'driver') {
        // Broadcast location to riders who have active rides with this driver
        socket.broadcast.emit('driver-location-update', {
          driverId: user.userId,
          ...locationData
        });
      }
    });

    // Handle ride status updates
    socket.on('ride-status-update', (data) => {
      // Emit to specific rider
      if (data.riderId) {
        io.to(`rider-${data.riderId}`).emit('ride-update', data);
      }
      
      // Emit to specific driver
      if (data.driverId) {
        io.to(`driver-${data.driverId}`).emit('ride-update', data);
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      const user = connectedUsers.get(socket.id);
      if (user) {
        console.log(`${user.userType} ${user.userId} disconnected`);
      }
      connectedUsers.delete(socket.id);
    });
  });
};

export const getConnectedUsers = () => {
  return connectedUsers;
};