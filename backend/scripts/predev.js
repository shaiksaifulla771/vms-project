const path = require('path');
const dotenv = require('dotenv');
const killPort = require('kill-port');
const { execSync } = require('child_process');

// Load environment variables from backend/.env or root
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config();

const port = parseInt(process.env.PORT, 10) || 5000;

async function freePort() {
  try {
    let pids = [];
    if (process.platform === 'win32') {
      try {
        const output = execSync(
          `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique"`
        ).toString().trim();
        if (output) {
          pids = output.split(/\r?\n/).map(p => p.trim()).filter(p => p && p !== String(process.pid));
        }
      } catch (e) {}
    }

    if (pids.length > 0) {
      console.log(`[Pre-Dev] Port ${port} is currently held by PID(s): ${pids.join(', ')}. Terminating old process...`);
    }

    await killPort(port, 'tcp');
    
    // Extra safety verify for Windows
    if (process.platform === 'win32' && pids.length > 0) {
      for (const pid of pids) {
        try {
          execSync(`taskkill /F /PID ${pid} 2>nul`);
        } catch (e) {}
      }
    }

    if (pids.length > 0) {
      console.log(`[Pre-Dev] ✓ Successfully cleared port ${port}.`);
    } else {
      console.log(`[Pre-Dev] Port ${port} is free.`);
    }
  } catch (err) {
    // If port was already free or killed, continue cleanly
    console.log(`[Pre-Dev] Port ${port} ready.`);
  }
}

freePort().then(() => {
  process.exit(0);
}).catch(() => {
  process.exit(0);
});
