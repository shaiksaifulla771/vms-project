const Appointment = require('../models/Appointment');
const Visitor = require('../models/Visitor');
const Sequence = require('../models/Sequence');
const auditService = require('./auditService');
const { eventBus, EVENTS } = require('../events/eventBus');

class AppointmentService {
  async getNextAppointmentNumber() {
    let seqDoc = await Sequence.findById('appointmentNumber');
    if (!seqDoc) {
      seqDoc = await Sequence.create({ _id: 'appointmentNumber', seq: 1000 });
    } else {
      seqDoc = await Sequence.findByIdAndUpdate('appointmentNumber', { $inc: { seq: 1 } }, { new: true });
    }
    return `APT-${seqDoc.seq}`;
  }

  async createAppointment(data, user = null) {
    const appointmentNumber = await this.getNextAppointmentNumber();
    const visitorForHost = await Visitor.findById(data.visitorId);
    const hostUserId = data.hostUserId || visitorForHost?.hostEmployeeId || user?._id;
    const isAdmin = user && user.role === 'Admin';
    const status = isAdmin ? 'SCHEDULED' : 'REQUESTED';

    const appointment = await Appointment.create({
      ...data,
      hostUserId,
      appointmentNumber,
      status,
      approvedBy: isAdmin ? user._id : null,
      approvalTime: isAdmin ? new Date() : null,
      createdBy: user ? user._id : null
    });

    if (isAdmin) {
      await Visitor.findByIdAndUpdate(data.visitorId, { status: 'EXPECTED' });
    }

    const visitor = await Visitor.findById(data.visitorId).populate('hostEmployeeId', 'username email');

    if (user) {
      await auditService.writeAuditLog(null, 'Appointment', appointment._id, 'CREATE', null, appointment.toObject(), user._id);
    }

    const payload = {
      appointmentId: appointment._id,
      appointmentNumber: appointment.appointmentNumber,
      visitorId: appointment.visitorId,
      visitorName: visitor ? visitor.fullName : 'Visitor',
      visitorEmail: visitor ? visitor.email : 'visitor@example.com',
      employeeName: visitor && visitor.hostEmployeeId ? visitor.hostEmployeeId.username : 'Host',
      hostEmail: visitor && visitor.hostEmployeeId ? visitor.hostEmployeeId.email : null,
      appointmentDate: new Date(appointment.scheduledStartTime).toLocaleDateString(),
      appointmentTime: new Date(appointment.scheduledStartTime).toLocaleTimeString(),
      status: appointment.status,
      purpose: appointment.purpose,
      siteId: appointment.siteId,
      approvalLink: `http://localhost:3000/vms/badge/${appointment._id}`
    };

    eventBus.emit(EVENTS.APPOINTMENT_CREATED, payload);

    if (isAdmin) {
      eventBus.emit(EVENTS.APPOINTMENT_APPROVED, payload);
    }

    return appointment;
  }

  async approveAppointment(appointmentId, userId, approvalNotes = '') {
    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) throw new Error('Appointment not found');

    appointment.status = 'SCHEDULED';
    appointment.approvedBy = userId;
    appointment.approvalTime = new Date();
    appointment.approvalNotes = approvalNotes;
    await appointment.save();
    await Visitor.findByIdAndUpdate(appointment.visitorId, { status: 'EXPECTED' });

    const visitor = await Visitor.findById(appointment.visitorId).populate('hostEmployeeId', 'username email');

    await auditService.writeAuditLog(null, 'Appointment', appointment._id, 'APPROVE', null, { status: appointment.status }, userId);

    const payload = {
      appointmentId: appointment._id,
      appointmentNumber: appointment.appointmentNumber,
      visitorName: visitor ? visitor.fullName : 'Visitor',
      visitorEmail: visitor ? visitor.email : 'visitor@example.com',
      employeeName: visitor && visitor.hostEmployeeId ? visitor.hostEmployeeId.username : 'Host',
      appointmentDate: new Date(appointment.scheduledStartTime).toLocaleDateString(),
      appointmentTime: new Date(appointment.scheduledStartTime).toLocaleTimeString(),
      companyName: 'VendorOS VMS',
      approvalLink: `http://localhost:3000/vms/badge/${appointment._id}`
    };

    eventBus.emit(EVENTS.APPOINTMENT_APPROVED, payload);

    return appointment;
  }

  async rejectAppointment(appointmentId, userId, rejectionReason = '') {
    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) throw new Error('Appointment not found');

    appointment.status = 'REJECTED';
    appointment.approvedBy = userId;
    appointment.approvalNotes = rejectionReason;
    await appointment.save();

    const visitor = await Visitor.findById(appointment.visitorId).populate('hostEmployeeId', 'username email');

    await auditService.writeAuditLog(null, 'Appointment', appointment._id, 'REJECT', null, { status: appointment.status }, userId);

    const payload = {
      appointmentId: appointment._id,
      appointmentNumber: appointment.appointmentNumber,
      visitorName: visitor ? visitor.fullName : 'Visitor',
      visitorEmail: visitor ? visitor.email : 'visitor@example.com',
      employeeName: visitor && visitor.hostEmployeeId ? visitor.hostEmployeeId.username : 'Host',
      companyName: 'VendorOS VMS',
      rejectionReason
    };

    eventBus.emit(EVENTS.APPOINTMENT_REJECTED, payload);

    return appointment;
  }

  async rescheduleAppointment(appointmentId, userId, { minutes, scheduledStartTime, scheduledEndTime, notes = '' }) {
    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) throw new Error('Appointment not found');

    const allowedMinuteOptions = [10, 30, 60];
    let nextStart;
    let nextEnd;

    if (scheduledStartTime) {
      nextStart = new Date(scheduledStartTime);
      nextEnd = scheduledEndTime
        ? new Date(scheduledEndTime)
        : new Date(nextStart.getTime() + (appointment.scheduledEndTime - appointment.scheduledStartTime));
    } else {
      const delay = allowedMinuteOptions.includes(Number(minutes)) ? Number(minutes) : 10;
      nextStart = new Date(new Date(appointment.scheduledStartTime).getTime() + delay * 60 * 1000);
      nextEnd = new Date(new Date(appointment.scheduledEndTime).getTime() + delay * 60 * 1000);
    }

    if (Number.isNaN(nextStart.getTime()) || Number.isNaN(nextEnd.getTime()) || nextEnd <= nextStart) {
      throw new Error('Invalid reschedule time range');
    }

    appointment.scheduledStartTime = nextStart;
    appointment.scheduledEndTime = nextEnd;
    appointment.status = 'RESCHEDULED';
    appointment.approvedBy = userId;
    appointment.approvalTime = new Date();
    appointment.approvalNotes = notes || `Rescheduled to ${nextStart.toISOString()}`;
    await appointment.save();

    await Visitor.findByIdAndUpdate(appointment.visitorId, { status: 'EXPECTED' });
    await auditService.writeAuditLog(null, 'Appointment', appointment._id, 'RESCHEDULE', null, {
      scheduledStartTime: nextStart,
      scheduledEndTime: nextEnd,
      status: appointment.status
    }, userId);

    return appointment;
  }

  async getOverview({ date = new Date(), siteId } = {}) {
    const targetDate = new Date(date);
    const start = new Date(targetDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(targetDate);
    end.setHours(23, 59, 59, 999);

    const appointmentQuery = {
      scheduledStartTime: { $gte: start, $lte: end },
      ...(siteId ? { siteId } : {})
    };
    const visitorQuery = {
      ...(siteId ? { siteId } : {}),
      $or: [
        { checkInTime: { $gte: start, $lte: end } },
        { checkOutTime: { $gte: start, $lte: end } },
        { createdAt: { $gte: start, $lte: end } }
      ]
    };

    const [appointments, visitors] = await Promise.all([
      Appointment.find(appointmentQuery)
        .populate('visitorId', 'fullName email phone company status checkInTime checkOutTime')
        .populate('hostUserId', 'username email role')
        .populate('siteId', 'name code')
        .sort({ scheduledStartTime: 1 })
        .limit(100),
      Visitor.find(visitorQuery)
        .populate('hostEmployeeId', 'username email role')
        .populate('siteId', 'name code')
        .sort({ checkInTime: -1, createdAt: -1 })
        .limit(100)
    ]);

    const currentlyInside = visitors.filter(v => ['CHECKED_IN', 'IN_VISIT'].includes(v.status)).length;
    const checkedOut = visitors.filter(v => v.status === 'CHECKED_OUT').length;
    const expected = appointments.filter(a => ['SCHEDULED', 'EXPECTED', 'RESCHEDULED'].includes(a.status)).length;
    const pendingRequests = appointments.filter(a => a.status === 'REQUESTED').length;

    return {
      metrics: {
        todaysVisitors: visitors.length,
        currentlyInside,
        expected,
        checkedOut,
        pendingRequests
      },
      todaysVisitors: visitors,
      appointments,
      notifications: appointments
        .filter(a => ['REQUESTED', 'SCHEDULED', 'EXPECTED', 'RESCHEDULED'].includes(a.status))
        .slice(0, 12)
        .map(a => ({
          id: a._id,
          type: a.status === 'REQUESTED' ? 'APPROVAL_REQUIRED' : 'UPCOMING_APPOINTMENT',
          visitorName: a.visitorId?.fullName || 'Visitor',
          hostName: a.hostUserId?.username || 'Host',
          hostRole: a.hostUserId?.role || '',
          appointmentTime: a.scheduledStartTime,
          purpose: a.purpose,
          status: a.status
        }))
    };
  }

  async getAppointments(query = {}, page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const appointments = await Appointment.find(query)
      .populate('visitorId', 'fullName email phone company')
      .populate('hostUserId', 'username email')
      .populate('siteId', 'name code')
      .populate('warehouseId', 'name code')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Appointment.countDocuments(query);
    return { appointments, total, page, pages: Math.ceil(total / limit) };
  }
}

module.exports = new AppointmentService();
