/**
 * Structured Logger — Formats operational, security, and audit log entries as JSON.
 * Incorporates request correlation IDs and authenticated user context.
 */
class Logger {
  format(level, reqOrModule, message, metadata = {}) {
    let correlationId = null;
    let userId = null;
    let moduleName = 'System';

    if (reqOrModule && typeof reqOrModule === 'object' && reqOrModule.correlationId !== undefined) {
      correlationId = reqOrModule.correlationId;
      userId = reqOrModule.user ? (reqOrModule.user._id || reqOrModule.user.id) : null;
      moduleName = reqOrModule.baseUrl || reqOrModule.originalUrl || 'HTTP';
    } else if (typeof reqOrModule === 'string') {
      moduleName = reqOrModule;
    }

    let metaPayload = metadata;
    if (metadata instanceof Error) {
      metaPayload = { name: metadata.name, message: metadata.message, stack: metadata.stack };
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      correlationId,
      userId,
      level,
      module: moduleName,
      message,
      ...(metaPayload && Object.keys(metaPayload).length > 0 ? { metadata: metaPayload } : {})
    };

    return JSON.stringify(logEntry);
  }

  info(reqOrModule, message, metadata) {
    console.log(this.format('INFO', reqOrModule, message, metadata));
  }

  warn(reqOrModule, message, metadata) {
    console.warn(this.format('WARN', reqOrModule, message, metadata));
  }

  error(reqOrModule, message, errorObj) {
    console.error(this.format('ERROR', reqOrModule, message, errorObj));
  }

  audit(reqOrModule, message, metadata) {
    console.log(this.format('AUDIT', reqOrModule, message, metadata));
  }
}

module.exports = new Logger();
