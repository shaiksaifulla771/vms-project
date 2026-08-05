const fs = require('fs');
const path = require('path');

const controllersDir = path.join(__dirname, 'controllers');
const files = fs.readdirSync(controllersDir).filter(f => f.endsWith('.js'));

files.forEach(file => {
  const filePath = path.join(controllersDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  if (content.includes('session.startTransaction()')) {
    // Inject import if not exists
    if (!content.includes('const { startSafeTransaction, commitSafeTransaction, abortSafeTransaction }')) {
        const importStatement = `const { startSafeTransaction, commitSafeTransaction, abortSafeTransaction } = require('../utils/transaction');\n`;
        // Insert after first require
        content = content.replace(/(const .* = require\(.*['"];\r?\n)/, `$1${importStatement}`);
    }

    content = content.replace(/session\.startTransaction\(\);/g, 'startSafeTransaction(session);');
    content = content.replace(/await session\.commitTransaction\(\);/g, 'await commitSafeTransaction(session);');
    content = content.replace(/await session\.abortTransaction\(\);/g, 'await abortSafeTransaction(session);');
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Patched ${file}`);
  }
});
