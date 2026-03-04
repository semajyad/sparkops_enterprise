# SparkOps Enterprise Setup Script
# This script helps set up the development environment

Write-Host "Setting up SparkOps Enterprise..." -ForegroundColor Green

# Check if Docker is running
Write-Host "Checking Docker status..." -ForegroundColor Yellow
try {
    $dockerInfo = docker info 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Docker is running" -ForegroundColor Green
    } else {
        Write-Host "❌ Docker is not running properly" -ForegroundColor Red
        Write-Host "Please start Docker Desktop manually" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "❌ Docker is not installed or not accessible" -ForegroundColor Red
    Write-Host "Please install Docker Desktop and restart this script" -ForegroundColor Yellow
    exit 1
}

# Build and start services
Write-Host "Building and starting services..." -ForegroundColor Yellow
docker-compose up --build -d

# Wait for services to be ready
Write-Host "Waiting for services to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

# Check service health
Write-Host "Checking service health..." -ForegroundColor Yellow
$services = @("backend", "frontend", "redis", "postgres")

foreach ($service in $services) {
    $health = docker-compose ps $service --format "table {{.Status}}" | Select-Object -Skip 1
    if ($health -like "*Up*") {
        Write-Host "✅ $service is running" -ForegroundColor Green
    } else {
        Write-Host "❌ $service is not running properly" -ForegroundColor Red
    }
}

Write-Host "Setup complete!" -ForegroundColor Green
Write-Host "Frontend: http://localhost:3000" -ForegroundColor Cyan
Write-Host "Backend API: http://localhost:8000" -ForegroundColor Cyan
Write-Host "API Docs: http://localhost:8000/docs" -ForegroundColor Cyan
