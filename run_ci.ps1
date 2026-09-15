$env:MONGODB_URI="mongodb://127.0.0.1:27017/vms_ci_test"
$env:PORT=5000
$env:NODE_ENV="test"

cd backend
Start-Process node -ArgumentList "server.js" -RedirectStandardOutput "server_ci.log" -RedirectStandardError "server_ci_err.log"

Start-Sleep -Seconds 5

node scripts/seed_admin.js
npm test
$testExitCode = $LASTEXITCODE

Stop-Process -Name "node" -ErrorAction SilentlyContinue

exit $testExitCode
