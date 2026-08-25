const Notification = require('../models/Notification');
const { getIo } = require('../utils/socket');
const logger = require('../utils/logger');

/**
 * Enterprise Notification Service for In-App & Real-Time Push Notifications
 */
class NotificationService {
  /**
   * Broadcast a notification to all active Administrators
   */
  static async notifyAdmins({ type, title, message, relatedUserId = null, metadata = {}, severity = 'info' }) {
    try {
      const doc = await Notification.create({
        recipientRole: 'Admin',
        type,
        title,
        message,
        relatedUserId,
        metadata,
        severity
      });

      // Real-time Push via Socket.IO
      try {
        const io = getIo();
        if (io) {
          const payload = {
            id: doc._id,
            type,
            title,
            message,
            relatedUserId,
            metadata,
            severity,
            createdAt: doc.createdAt
          };
          io.to('role:Admin').to('admin_room').emit('notification:admin', payload);
          io.to('role:Admin').to('admin_room').emit('notification', payload);
        }
      } catch (sockErr) {
        // Socket may not be initialized in test or script context
      }

      return doc;
    } catch (err) {
      logger.error('NotificationService', `Failed to create admin notification: ${err.message}`);
      return null;
    }
  }

  /**
   * Send a direct notification to a specific user
   */
  static async notifyUser(userId, { type, title, message, metadata = {}, severity = 'info' }) {
    try {
      const doc = await Notification.create({
        recipientUserId: userId,
        recipientRole: null,
        type,
        title,
        message,
        relatedUserId: userId,
        metadata,
        severity
      });

      // Real-time Push via Socket.IO
      try {
        const io = getIo();
        if (io) {
          const payload = {
            id: doc._id,
            type,
            title,
            message,
            metadata,
            severity,
            createdAt: doc.createdAt
          };
          io.to(`user:${userId}`).emit('notification:user', payload);
          io.to(`user:${userId}`).emit('notification', payload);
        }
      } catch (sockErr) {
        // Socket not available
      }

      return doc;
    } catch (err) {
      logger.error('NotificationService', `Failed to notify user ${userId}: ${err.message}`);
      return null;
    }
  }

  /**
   * Fetch unread and recent notifications for a user
   */
  static async getNotificationsForUser(user) {
    const query = {
      $or: [
        { recipientUserId: user._id }
      ]
    };

    if (user.role === 'Admin') {
      query.$or.push({ recipientRole: { $in: ['Admin', 'admin', 'all'] } });
    }

    return await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
  }

  /**
   * Mark a notification as read
   */
  static async markAsRead(notificationId, userId) {
    return await Notification.findOneAndUpdate(
      { _id: notificationId },
      { $set: { read: true } },
      { new: true }
    );
  }

  /**
   * Mark all notifications as read for a user
   */
  static async markAllAsRead(user) {
    const query = {
      $or: [
        { recipientUserId: user._id }
      ]
    };
    if (user.role === 'Admin') {
      query.$or.push({ recipientRole: { $in: ['Admin', 'admin', 'all'] } });
    }

    return await Notification.updateMany(query, { $set: { read: true } });
  }
}

module.exports = NotificationService;
