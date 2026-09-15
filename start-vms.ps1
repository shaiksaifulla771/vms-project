# Vendor Management System (VMS) Portal Dev Server Bootstrapper
Clear-Host

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "         VENDOR MANAGEMENT SYSTEM (VMS) LOADER" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Check MongoDB Status
Write-Host "Checking local database service status..." -ForegroundColor Yellow
$mongoService = Get-Service -Name MongoDB -ErrorAction SilentlyContinue

if ($mongoService -and $mongoService.Status -eq "Running") {
    Write-Host "[PASSED] MongoDB Server is running locally on port 27017." -ForegroundColor Green
} else {
    Write-Host "[WARNING] MongoDB Server service was not found or is stopped!" -ForegroundColor Red
    Write-Host "Please ensure MongoDB is running or specify your MONGO_URI environment variable." -ForegroundColor Red
}

# 2. Print evaluation credentials
Write-Host "`n----------------------------------------------------------" -ForegroundColor Gray
Write-Host "PORTAL LOGIN EVALUATION PRESETS:" -ForegroundColor Yellow
Write-Host "1. Admin Role:" -ForegroundColor Gray
Write-Host "   Email:    admin@vms.com" -ForegroundColor Cyan
Write-Host "   Password: admin123" -ForegroundColor Cyan
Write-Host "2. Manager Role:" -ForegroundColor Gray
Write-Host "   Email:    manager@vms.com" -ForegroundColor Cyan
Write-Host "   Password: manager123" -ForegroundColor Cyan
Write-Host "----------------------------------------------------------" -ForegroundColor Gray

Write-Host "`nBooting frontend and backend servers concurrently..." -ForegroundColor Yellow
Write-Host "VMS Portal UI will be accessible at: http://localhost:3000" -ForegroundColor Green
Write-Host "Close this window or press Ctrl+C to terminate both servers.`n" -ForegroundColor Gray

# 3. Boot servers
npm start
