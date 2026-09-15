const { eventBus, EVENTS } = require('../../events/eventBus');

describe('Session 6 — Domain Event Bus Unit Tests', () => {
  afterEach(() => {
    eventBus.removeAllListeners();
  });

  test('1. Should emit domain event and execute registered subscribers with correlation context', (done) => {
    const correlationId = 'CORR-EVT-1001';

    eventBus.on(EVENTS.PO_RECEIVED, (payload) => {
      try {
        expect(payload.correlationId).toBe(correlationId);
        expect(payload.poId).toBe('PO-5555');
        expect(payload.timestamp).toBeDefined();
        done();
      } catch (err) {
        done(err);
      }
    });

    eventBus.emit(EVENTS.PO_RECEIVED, { correlationId, poId: 'PO-5555' });
  });

  test('2. Should ISOLATE subscriber errors so primary caller execution is NEVER interrupted or thrown', () => {
    // Subscriber that deliberately throws an error
    eventBus.on(EVENTS.INVENTORY_CONSUMED, () => {
      throw new Error('Crashing subscriber simulation');
    });

    // Primary caller emitting event -> MUST NOT THROW
    expect(() => {
      const result = eventBus.emit(EVENTS.INVENTORY_CONSUMED, { materialId: 'MAT-1' });
      expect(result).toBe(true);
    }).not.toThrow();
  });

  test('3. Should safely handle async listener promises that reject', async () => {
    eventBus.on(EVENTS.QC_PASSED, async () => {
      throw new Error('Async background handler failed');
    });

    expect(() => {
      eventBus.emit(EVENTS.QC_PASSED, { recordId: 'QC-1' });
    }).not.toThrow();
  });
});
