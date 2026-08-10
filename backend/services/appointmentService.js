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

    const isAdmin = user && user.role === 'Admin';
    const status = isAdmin ? 'Approved' : 'Pending Approval';

    const appointment = await Appointment.create({
      ...data,
      appointmentNumber,
      status,
      approvedBy: isAdmin ? user._id : null,
      approvalTime: isAdmin ? new Date() : null,
      createdBy: user ? user._id : null
    });

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

    appointment.status = 'Approved';
    appointment.approvedBy = userId;
    appointment.approvalTime = new Date();
    appointment.approvalNotes = approvalNotes;
    await appointment.save();

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

    appointment.status = 'Rejected';
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
