const mongoose = require('mongoose');

describe('EMPTY STRING OBJECTID SANITIZER (BSONCastError Prevention)', () => {
  const cleanObjectId = (val) => {
    if (!val || val === '' || val === 'null' || val === 'undefined') return null;
    return mongoose.Types.ObjectId.isValid(val) ? val : null;
  };

  test('Sanitizes empty strings "" to null instead of failing BSON cast', () => {
    expect(cleanObjectId('')).toBeNull();
    expect(cleanObjectId('null')).toBeNull();
    expect(cleanObjectId('undefined')).toBeNull();
    expect(cleanObjectId(null)).toBeNull();
    expect(cleanObjectId(undefined)).toBeNull();
  });

  test('Preserves valid 24-character hexadecimal MongoDB ObjectIds', () => {
    const validId = '609bda561c9d4400008b4567';
    expect(cleanObjectId(validId)).toBe(validId);
  });
});
