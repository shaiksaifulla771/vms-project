const crypto = require('crypto');

// Base32 character set (RFC 4648)
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Encodes a buffer into a Base32 string
 * @param {Buffer} buffer
 * @returns {String}
 */
function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_CHARS[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Decodes a Base32 string into a Buffer
 * @param {String} base32
 * @returns {Buffer}
 */
function base32Decode(base32) {
  const clean = base32.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];

  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_CHARS.indexOf(clean[i]);
    if (idx === -1) continue;

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Generates a random Base32 secret for TOTP (Google Authenticator)
 * @param {Number} [length=20] - Number of bytes
 * @returns {String} Base32 secret
 */
function generateSecret(length = 20) {
  const randomBytes = crypto.randomBytes(length);
  return base32Encode(randomBytes);
}

/**
 * Computes the 6-digit TOTP code for a given secret and counter
 * @param {String} secret - Base32 encoded secret
 * @param {Number} counter - Time step counter
 * @returns {String} 6-digit zero-padded OTP
 */
function generateTOTP(secret, counter) {
  const key = base32Decode(secret);
  const buffer = Buffer.alloc(8);
  buffer.writeBigInt64BE(BigInt(counter));

  const hmac = crypto.createHmac('sha1', key);
  hmac.update(buffer);
  const digest = hmac.digest();

  const offset = digest[digest.length - 1] & 0xf;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  const otp = (code % 1000000).toString().padStart(6, '0');
  return otp;
}

/**
 * Verifies a 6-digit TOTP code against a secret with time-step drift window
 * @param {String} token - 6-digit user provided OTP
 * @param {String} secret - Base32 secret
 * @param {Number} [window=1] - Number of 30-second steps to check (+/- window)
 * @returns {Boolean}
 */
function verifyTOTP(token, secret, window = 1) {
  if (!token || !secret) return false;
  const cleanToken = String(token).trim();
  if (!/^\d{6}$/.test(cleanToken)) return false;

  const step = 30;
  const currentCounter = Math.floor(Date.now() / 1000 / step);

  for (let i = -window; i <= window; i++) {
    const expected = generateTOTP(secret, currentCounter + i);
    if (crypto.timingSafeEqual(Buffer.from(cleanToken), Buffer.from(expected))) {
      return true;
    }
  }

  return false;
}

/**
 * Generates the standard `otpauth://` URI for QR code generation
 * @param {String} account - User email or username
 * @param {String} issuer - Application name (e.g. 'VendorOS VMS')
 * @param {String} secret - Base32 secret
 * @returns {String}
 */
function generateKeyUri(account, issuer, secret) {
  const encIssuer = encodeURIComponent(issuer);
  const encAccount = encodeURIComponent(account);
  return `otpauth://totp/${encIssuer}:${encAccount}?secret=${secret}&issuer=${encIssuer}&algorithm=SHA1&digits=6&period=30`;
}

module.exports = {
  generateSecret,
  generateTOTP,
  verifyTOTP,
  generateKeyUri,
  base32Encode,
  base32Decode
};
