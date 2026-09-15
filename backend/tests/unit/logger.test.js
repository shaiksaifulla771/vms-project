const correlationMiddleware = require('../../middleware/correlationMiddleware');
const logger = require('../../utils/logger');

describe('Session 5 — Correlation ID & Structured Logger Unit Tests', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      headers: {},
      baseUrl: '/api/test'
    };
    res = {
      headers: {},
      setHeader(name, value) {
        this.headers[name] = value;
      }
    };
    next = jest.fn();
  });

  test('1. Should generate UUID v4 correlationId if absent in incoming request headers', () => {
    correlationMiddleware(req, res, next);

    expect(req.correlationId).toBeDefined();
    expect(typeof req.correlationId).toBe('string');
    expect(res.headers['X-Correlation-Id']).toBe(req.correlationId);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('2. Should preserve client-supplied X-Correlation-Id header', () => {
    const customCorrelationId = 'CORR-9999-CUSTOM-UUID';
    req.headers['x-correlation-id'] = customCorrelationId;

    correlationMiddleware(req, res, next);

    expect(req.correlationId).toBe(customCorrelationId);
    expect(res.headers['X-Correlation-Id']).toBe(customCorrelationId);
  });

  test('3. Should format structured JSON logs with correlationId and user context', () => {
    req.correlationId = 'CORR-TEST-1234';
    req.user = { _id: 'USER-ID-5555' };

    const formatted = logger.format('INFO', req, 'Test operational message', { key: 'value' });
    const parsed = JSON.parse(formatted);

    expect(parsed.timestamp).toBeDefined();
    expect(parsed.level).toBe('INFO');
    expect(parsed.correlationId).toBe('CORR-TEST-1234');
    expect(parsed.userId).toBe('USER-ID-5555');
    expect(parsed.message).toBe('Test operational message');
    expect(parsed.metadata).toEqual({ key: 'value' });
  });

  test('4. Should format Error objects cleanly in logger.error', () => {
    const testError = new Error('Database connection failed');
    req.correlationId = 'CORR-ERR-0000';

    const formatted = logger.format('ERROR', req, 'System failure', testError);
    const parsed = JSON.parse(formatted);

    expect(parsed.level).toBe('ERROR');
    expect(parsed.message).toBe('System failure');
    expect(parsed.metadata.message).toBe('Database connection failed');
    expect(parsed.metadata.stack).toBeDefined();
  });
});
