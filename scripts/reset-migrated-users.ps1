$ErrorActionPreference = 'Stop'
$taskRepo = Split-Path $PSScriptRoot -Parent
$taskOldUserId = $env:ENDO_RESET_USER_ID
$taskOldPassword = $env:ENDO_RESET_NEW_PASSWORD
try {
    Set-Location -LiteralPath $taskRepo
    $taskUsersJson = & node --env-file=.env.local scripts/reset-migrated-users.mjs list
    if ($LASTEXITCODE -ne 0) { throw 'Cannot read migrated users.' }
    $taskUsers = $taskUsersJson | ConvertFrom-Json
    foreach ($taskUser in $taskUsers) {
        Write-Host ('Set a new password for: ' + $taskUser.email)
        $taskSecurePassword = Read-Host 'New password (at least 8 characters)' -AsSecureString
        $taskSecureConfirm = Read-Host 'Confirm new password' -AsSecureString
        $taskPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSecurePassword)
        $taskConfirmPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSecureConfirm)
        try {
            $env:ENDO_RESET_NEW_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPointer)
            $taskConfirmText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskConfirmPointer)
            if ($env:ENDO_RESET_NEW_PASSWORD -cne $taskConfirmText) { throw 'Passwords do not match. Run the script again.' }
            $env:ENDO_RESET_USER_ID = $taskUser.id
            & node --env-file=.env.local scripts/reset-migrated-users.mjs reset
            if ($LASTEXITCODE -ne 0) { throw 'Password reset or login verification failed.' }
        } finally {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPointer)
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskConfirmPointer)
            $taskSecurePassword.Dispose()
            $taskSecureConfirm.Dispose()
            $taskConfirmText = $null
            $env:ENDO_RESET_NEW_PASSWORD = $null
        }
    }
    Write-Host 'All migrated users were reset and verified.'
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
} finally {
    $env:ENDO_RESET_USER_ID = $taskOldUserId
    $env:ENDO_RESET_NEW_PASSWORD = $taskOldPassword
}
Read-Host 'Press Enter to close'
