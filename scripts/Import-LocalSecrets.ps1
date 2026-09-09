[CmdletBinding()]
param()

$projectRoot = Split-Path -Parent $PSScriptRoot
$secretsDirectory = Join-Path $projectRoot '.secrets'

function Read-DpapiSecret {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Missing encrypted credential file: $Path"
    }

    $secureValue = (Get-Content -LiteralPath $Path -Raw).Trim() | ConvertTo-SecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)

    try {
        [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

$env:ZHIHU_ACCESS_SECRET = Read-DpapiSecret -Path (Join-Path $secretsDirectory 'zhihu-access-secret.dpapi')
$env:OPENAI_API_KEY = Read-DpapiSecret -Path (Join-Path $secretsDirectory 'openai-next-api-key.dpapi')
$env:OPENAI_BASE_URL = 'https://api.openai-next.com'

Write-Output 'Loaded ZHIHU_ACCESS_SECRET, OPENAI_API_KEY, and OPENAI_BASE_URL into the current PowerShell process.'
