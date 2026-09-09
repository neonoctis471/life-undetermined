[CmdletBinding()]
param()

$projectRoot = Split-Path -Parent $PSScriptRoot
$secretsDirectory = Join-Path $projectRoot '.secrets'

New-Item -ItemType Directory -Path $secretsDirectory -Force | Out-Null

$zhihuSecret = Read-Host 'Zhihu Access Secret' -AsSecureString
$aiApiKey = Read-Host 'AI API Key' -AsSecureString

$zhihuSecret | ConvertFrom-SecureString | Set-Content -LiteralPath (Join-Path $secretsDirectory 'zhihu-access-secret.dpapi') -Encoding utf8
$aiApiKey | ConvertFrom-SecureString | Set-Content -LiteralPath (Join-Path $secretsDirectory 'openai-next-api-key.dpapi') -Encoding utf8

Write-Output 'Local credentials were encrypted with Windows DPAPI and saved under .secrets.'
