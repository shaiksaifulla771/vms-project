const { generateSecret, generateTOTP, verifyTOTP, generateKeyUri } = require('../../utils/totp');
const { escapeRegex } = require('../../utils/regex');

describe('Security & 2FA Unit Tests', () => {
  describe('RFC 6238 TOTP (Google Authenticator) Engine', () => {
    test('1. Should generate valid Base32 secret', () => {
      const secret = generateSecret(20);
      expect(typeof secret).toBe('string');
      expect(secret.length).toBeGreaterThan(16);
      expect(secret).toMatch(/^[A-Z2-7]+$/);
    });

    test('2. Should generate 6-digit TOTP code', () => {
      const secret = generateSecret(20);
      const step = 30;
      const counter = Math.floor(Date.now() / 1000 / step);
      const code = generateTOTP(secret, counter);

      expect(typeof code).toBe('string');
      expect(code.length).toBe(6);
      expect(code).toMatch(/^\d{6}$/);
    });

    test('3. Should verify valid TOTP code within time window', () => {
      const secret = generateSecret(20);
      const step = 30;
      const counter = Math.floor(Date.now() / 1000 / step);
      const code = generateTOTP(secret, counter);

      const isValid = verifyTOTP(code, secret);
      expect(isValid).toBe(true);
    });

    test('4. Should reject invalid TOTP code', () => {
      const secret = generateSecret(20);
      const isValid = verifyTOTP('000000', secret);
      // Unless the random counter generates 000000, it should be false
      const step = 30;
      const counter = Math.floor(Date.now() / 1000 / step);
      const validCode = generateTOTP(secret, counter);
      if (validCode !== '000000') {
        expect(isValid).toBe(false);
      }
    });

    test('5. Should generate valid otpauth:// URI for Google Authenticator QR Code', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const uri = generateKeyUri('admin@vms.com', 'VendorOS VMS', secret);
      expect(uri).toContain('otpauth://totp/');
      expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
      expect(uri).toContain('digits=6');
      expect(uri).toContain('period=30');
    });
  });

  describe('Regex Sanitization Engine', () => {
    test('6. Should escape special regex characters to prevent ReDoS', () => {
      const dangerousInput = 'test.*+?^${}()|[]\\string';
      const escaped = escapeRegex(dangerousInput);
      expect(escaped).toBe('test\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\string');

      // Ensure creating RegExp does not throw SyntaxError
      expect(() => new RegExp(escaped, 'i')).not.toThrow();
    });

    test('7. Should handle empty or non-string input safely', () => {
      expect(escapeRegex('')).toBe('');
      expect(escapeRegex(null)).toBe('');
      expect(escapeRegex(undefined)).toBe('');
    });
  });
});
