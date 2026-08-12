const User = require('../models/User');

/**
 * Generates a 4-digit sequence user code starting from 500 (e.g. USR-0500, USR-0501, USR-0502)
 */
async function generateNextUserCode() {
  try {
    const usersWithCode = await User.find({ userCode: { $regex: /^USR-\d{4}$/ } })
      .select('userCode')
      .lean();

    let maxNum = 499; // Default so first code is 500 (USR-0500)

    usersWithCode.forEach(u => {
      if (u.userCode) {
        const match = u.userCode.match(/^USR-(\d{4})$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxNum) {
            maxNum = num;
          }
        }
      }
    });

    const nextNum = maxNum + 1;
    const formattedNum = String(nextNum).padStart(4, '0');
    return `USR-${formattedNum}`;
  } catch (err) {
    console.error('Error generating userCode sequence:', err.message);
    const fallbackNum = Math.floor(500 + Math.random() * 9000);
    return `USR-${String(fallbackNum).padStart(4, '0')}`;
  }
}

module.exports = { generateNextUserCode };
