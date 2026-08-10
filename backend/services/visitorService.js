const Visitor = require('../models/Visitor');
const Sequence = require('../models/Sequence');
const auditService = require('./auditService');
const { eventBus, EVENTS } = require('../events/eventBus');

class VisitorService {
  async getNextVisitorCode() {
    let seqDoc = await Sequence.findById('visitorCode');
    if (!seqDoc) {
      seqDoc = await Sequence.create({ _id: 'visitorCode', seq: 1000 });
    } else {
      seqDoc = await Sequence.findByIdAndUpdate('visitorCode', { $inc: { seq: 1 } }, { new: true });
    }
    return `VIS-${seqDoc.seq}`;
  }

  async createVisitor(data, userId = null) {
    const visitorCode = await this.getNextVisitorCode();
    const visitor = await Visitor.create({
      ...data,
      visitorCode,
      createdBy: userId || data.hostEmployeeId
    });

    if (userId) {
      await auditService.writeAuditLog(null, 'Visitor', visitor._id, 'CREATE', null, visitor.toObject(), userId);
    }

    eventBus.emit(EVENTS.VISITOR_CREATED, {
      visitorId: visitor._id,
      visitorCode: visitor.visitorCode,
      visitorName: visitor.fullName,
      visitorEmail: visitor.email,
      phone: visitor.phone,
      company: visitor.company,
      hostEmployeeId: visitor.hostEmployeeId,
      siteId: visitor.siteId,
      status: visitor.status
    });

    return visitor;
  }

  async checkInVisitor(visitorId, userId = null) {
    const visitor = await Visitor.findById(visitorId).populate('hostEmployeeId', 'username email');
    if (!visitor) throw new Error('Visitor not found');

    visitor.status = 'Checked In';
    visitor.checkInTime = new Date();
    await visitor.save();

    if (userId) {
      await auditService.writeAuditLog(null, 'Visitor', visitor._id, 'CHECK_IN', null, { status: visitor.status }, userId);
    }

    eventBus.emit(EVENTS.VISITOR_CHECKED_IN, {
      visitorId: visitor._id,
      visitorName: visitor.fullName,
      hostEmail: visitor.hostEmployeeId ? visitor.hostEmployeeId.email : null,
      employeeName: visitor.hostEmployeeId ? visitor.hostEmployeeId.username : 'Host',
      companyName: visitor.company || 'VendorOS VMS'
    });

    return visitor;
  }

  async checkOutVisitor(visitorId, userId = null) {
    const visitor = await Visitor.findById(visitorId).populate('hostEmployeeId', 'username email');
    if (!visitor) throw new Error('Visitor not found');

    visitor.status = 'Checked Out';
    visitor.checkOutTime = new Date();
    await visitor.save();

    if (userId) {
      await auditService.writeAuditLog(null, 'Visitor', visitor._id, 'CHECK_OUT', null, { status: visitor.status }, userId);
    }

    eventBus.emit(EVENTS.VISITOR_CHECKED_OUT, {
      visitorId: visitor._id,
      visitorName: visitor.fullName,
      hostEmail: visitor.hostEmployeeId ? visitor.hostEmployeeId.email : null,
      employeeName: visitor.hostEmployeeId ? visitor.hostEmployeeId.username : 'Host'
    });

    return visitor;
  }

  async getVisitors(query = {}, page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const visitors = await Visitor.find(query)
      .populate('hostEmployeeId', 'username email')
      .populate('siteId', 'name code')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Visitor.countDocuments(query);
    return { visitors, total, page, pages: Math.ceil(total / limit) };
  }
}

module.exports = new VisitorService();
