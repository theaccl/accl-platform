param(
  [Parameter(Mandatory = $true)]
  [string]$MigrationFile
)

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

function Get-EnvValue([string]$Key) {
  foreach ($line in Get-Content '.env.local') {
    $t = $line.Trim()
    if (-not $t -or $t.StartsWith('#')) { continue }
    $i = $t.IndexOf('=')
    if ($i -lt 1) { continue }
    if ($t.Substring(0, $i).Trim() -eq $Key) {
      return $t.Substring($i + 1).Trim()
    }
  }
  return $null
}

$token = Get-EnvValue 'SUPABASE_ACCESS_TOKEN'
if (-not $token) { throw 'SUPABASE_ACCESS_TOKEN missing in .env.local' }
$ref = (Get-Content 'supabase/.temp/project-ref' -Raw).Trim()
$sqlPath = Join-Path 'supabase/migrations' $MigrationFile
if (-not (Test-Path $sqlPath)) { throw "Migration not found: $sqlPath" }

$bodyObj = @{
  query     = Get-Content $sqlPath -Raw
  read_only = $false
}
$jsonPath = 'tmp/migration-apply-body.json'
if (-not (Test-Path 'tmp')) { New-Item -ItemType Directory -Path 'tmp' | Out-Null }
$json = @{ query = $bodyObj.query; read_only = $false } | ConvertTo-Json -Compress
[System.IO.File]::WriteAllText((Join-Path (Get-Location) $jsonPath), $json, [System.Text.UTF8Encoding]::new($false))

$uri = "https://api.supabase.com/v1/projects/$ref/database/query"
$response = Invoke-RestMethod -Uri $uri -Method POST -Headers @{ Authorization = "Bearer $token" } -ContentType 'application/json; charset=utf-8' -InFile $jsonPath
Write-Output "OK: applied $MigrationFile"
$response | ConvertTo-Json -Depth 4
