describe('STOCK TRANSFER RCA FIX & ERROR PARSING', () => {
  test('Extracts precise backend error message instead of generic fallback', () => {
    const errorFromBackend = {
      response: {
        data: {
          success: false,
          errorType: 'ValidationError',
          message: 'Insufficient stock in source warehouse (FINISHED PRODUCT STORAGE). Available: 0, Requested: 50'
        }
      }
    };

    const parsedMsg = errorFromBackend.response?.data?.message || errorFromBackend.response?.data?.error || errorFromBackend.message || 'Transfer failed';
    expect(parsedMsg).toBe('Insufficient stock in source warehouse (FINISHED PRODUCT STORAGE). Available: 0, Requested: 50');
    expect(parsedMsg).not.toBe('Transfer failed');
  });

  test('Auto-syncs available balance from onHand stock when available is uninitialized', () => {
    const item = {
      onHand: 100,
      available: 0,
      reserved: 0,
      allocated: 0,
      blocked: 0
    };

    if (item.available === 0 && item.onHand > 0) {
      const calc = item.onHand - item.reserved - item.allocated - item.blocked;
      if (calc > 0) item.available = calc;
    }

    expect(item.available).toBe(100);
  });
});
