const socketIo = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { getPubClient, getSubClient, getRedisStatus } = require('../config/redis');
const { protect } = require('../middleware/authMiddleware');
const logger = require('./logger');

let io;

const initSocket = (server) => {
  io = socketIo(server, {
    cors: {
      origin: process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',') : ['http://localhost:3000', 'http://localhost:3001'],
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  // Attach Redis adapter if Redis is available
  if (getRedisStatus()) {
    const pubClient = getPubClient();
    const subClient = getSubClient();
    if (pubClient && subClient) {
      io.adapter(createAdapter(pubClient, subClient));
      logger.info('Socket.IO', 'Redis Adapter configured.');
    }
  }

  // Use the existing Dual-Engine auth middleware by mocking req/res
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      if (!token) {
        return next(new Error('Authentication required'));
      }

      // Mock req and res for the protect middleware
      const req = {
        headers: {
          authorization: `Bearer ${token}`
        }
      };
      
      const res = {
        status: (code) => ({
          json: (data) => next(new Error(data.error || 'Authentication failed'))
        })
      };

      await protect(req, res, (err) => {
        if (err) return next(err);
        if (!req.user) return next(new Error('Authentication failed'));
        
        socket.user = req.user;
        next();
      });
    } catch (err) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    logger.info('Socket.IO', `Client connected: ${socket.user._id} (${socket.user.email})`);

    // Personal user room
    socket.join(`user:${socket.user._id}`);
    if (socket.user.email) {
      socket.join(`user:${socket.user.email}`);
    }

    // Automatically join room for their specific Site
    if (socket.user.siteId) {
      socket.join(`site:${socket.user.siteId}`);
    }

    // Role-based room (e.g., 'role:Admin')
    if (socket.user.role) {
      socket.join(`role:${socket.user.role}`);
      if (socket.user.role === 'Admin') {
        socket.join('admin_room');
      }
    }

    socket.on('disconnect', () => {
      logger.info('Socket.IO', `Client disconnected: ${socket.user._id}`);
    });
  });

  // Also listen to Redis Pub/Sub directly to emit via Socket.IO
  if (getRedisStatus()) {
    const subClient = getSubClient();
    if (subClient) {
       const handleRedisMessage = (pattern, channel, message) => {
         if (pattern !== 'domain:*') return;
         try {
           const payload = JSON.parse(message);
           const eventName = channel.replace('domain:', '');
           
           if (payload.siteId) {
             io.to(`site:${payload.siteId}`).emit(eventName, payload);
           } else {
             // Broadcast to all
             io.emit(eventName, payload);
           }
         } catch (e) {
           logger.error('Socket.IO', 'Failed to relay Redis message', e);
         }
       };
       
       subClient.on('pmessage', handleRedisMessage);
    }
  }

  return io;
};

const getIo = () => {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  return io;
};

module.exports = { initSocket, getIo };
