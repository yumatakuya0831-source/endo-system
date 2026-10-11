param([string]$ResultPath)

$ErrorActionPreference = 'Stop'
$taskPreviousPassword = $env:ENDO_SETUP_ADMIN_PASSWORD
try {
    Write-Host 'Set up the local PostgreSQL database for ENDO.'
    Write-Host 'Host: 127.0.0.1:5432  Administrator: postgres'
    Write-Host 'Database: endo_system_dev  Application user: endo_app_dev'
    $taskSecurePassword = Read-Host 'PostgreSQL administrator password' -AsSecureString
    $taskPasswordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSecurePassword)
    try {
        $env:ENDO_SETUP_ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPasswordPointer)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPasswordPointer)
        $taskSecurePassword.Dispose()
    }
    & node (Join-Path $PSScriptRoot 'setup-postgres.mjs') $ResultPath
    if ($LASTEXITCODE -ne 0) { throw 'Database setup failed. Check the stage shown above.' }
    Write-Host 'Setup completed. Restart npm run dev to load the connection settings.'
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($ResultPath -and -not (Test-Path -LiteralPath $ResultPath)) {
        @{ status = 'failed'; stage = 'password-input' } | ConvertTo-Json | Set-Content -LiteralPath $ResultPath
    }
} finally {
    $env:ENDO_SETUP_ADMIN_PASSWORD = $taskPreviousPassword
}
Read-Host 'Press Enter to close'
