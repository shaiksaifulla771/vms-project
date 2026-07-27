/**
 * Escapes special regex characters in a user search string to prevent ReDoS & Regex Injection vulnerabilities.
 * @param {string} str - Raw user search string
 * @returns {string} - Escaped safe regex string
 */
const escapeRegex = (str) => {
  if (typeof str !== 'string') return '';
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

module.exports = {
  escapeRegex,
};
