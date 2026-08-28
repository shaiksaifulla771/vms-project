/**
 * Escapes special regular expression characters in a string
 * Prevents ReDoS attacks and RegExp syntax errors when creating dynamic regexes from user input.
 * @param {String} string
 * @returns {String}
 */
function escapeRegex(string) {
  if (typeof string !== 'string') return '';
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  escapeRegex
};
