# Ensure backend .env exists without overwriting existing MONGO_URI
if (-not (Test-Path "backend\.env")) {
    $envContent = @"
NODE_ENV=development
PORT=5000
MONGO_URI=mongodb+srv://shaiksaifulla123:shaiksaifulla2005@cluster0.7zntkvp.mongodb.net/vms?retryWrites=true&w=majority&appName=Cluster0
JWT_SECRET=this_is_a_very_long_super_secret_vms_development_key_1234567890
SESSION_SECRET=this_is_a_very_long_super_secret_vms_development_key_1234567890
CLIENT_URL=http://localhost:3000,http://localhost:5173
"@
    Set-Content -Path "backend\.env" -Value $envContent
}

Write-Host "Starting Python Microservice..."
Start-Process -NoNewWindow -FilePath "python" -ArgumentList "main.py" -WorkingDirectory "backend\microservices\mrp_optimizer"

Write-Host "Installing Backend Dependencies..."
Start-Process -Wait -NoNewWindow -FilePath "cmd.exe" -ArgumentList "/c `"npm install --legacy-peer-deps && npm install jsonwebtoken socket.io @socket.io/redis-adapter --legacy-peer-deps`"" -WorkingDirectory "backend"

Write-Host "Starting Backend..."
Start-Process -NoNewWindow -FilePath "cmd.exe" -ArgumentList "/c `"npm run dev`"" -WorkingDirectory "backend"

Write-Host "Installing Frontend Dependencies..."
Start-Process -Wait -NoNewWindow -FilePath "cmd.exe" -ArgumentList "/c `"npm install --legacy-peer-deps && npm install socket.io-client --legacy-peer-deps`"" -WorkingDirectory "frontend"

Write-Host "Starting Frontend..."
Start-Process -NoNewWindow -FilePath "cmd.exe" -ArgumentList "/c `"npm run dev`"" -WorkingDirectory "frontend"

Write-Host "All services started!"
