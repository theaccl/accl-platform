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

function Invoke-DbQuery([string]$Sql, [bool]$ReadOnly = $true) {
  $token = Get-EnvValue 'SUPABASE_ACCESS_TOKEN'
  $ref = (Get-Content 'supabase/.temp/project-ref' -Raw).Trim()
  $body = @{ query = $Sql; read_only = $ReadOnly } | ConvertTo-Json -Compress
  $tmp = Join-Path $env:TEMP "accl-db-query-$([guid]::NewGuid().ToString('n')).json"
  [System.IO.File]::WriteAllText($tmp, $body)
  try {
    return Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$ref/database/query" -Method POST `
      -Headers @{ Authorization = "Bearer $token" } -ContentType 'application/json; charset=utf-8' -InFile $tmp
  } finally {
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  }
}

$checks = @(
  @{ Name = 'badge 7d'; Sql = "select public.classify_free_badge_track_key('daily', '7d') as track_key;"; Want = 'daily_7_day'; Field = 'track_key' },
  @{ Name = 'badge 2m'; Sql = "select public.classify_free_badge_track_key('live', '2m') as track_key;"; Want = 'bullet_2_0'; Field = 'track_key' },
  @{ Name = 'p1 2m'; Sql = "select public.classify_p1_rating_bucket('free', 'live', '2m') as bucket;"; Want = 'free_bullet'; Field = 'bucket' },
  @{ Name = 'p1 20m legacy'; Sql = "select public.classify_p1_rating_bucket('free', 'live', '20m') as bucket;"; Want = 'free_rapid'; Field = 'bucket' },
  @{ Name = 'p1 5d legacy'; Sql = "select public.classify_p1_rating_bucket('free', 'daily', '5d') as bucket;"; Want = 'free_day'; Field = 'bucket' }
)

$fail = 0
foreach ($c in $checks) {
  $rows = Invoke-DbQuery $c.Sql $true
  $val = $rows[0].($c.Field)
  if ($val -eq $c.Want) {
    Write-Output "OK: $($c.Name) = $val"
  } else {
    Write-Output "FAIL: $($c.Name) got $val want $($c.Want)"
    $fail++
  }
}

$defRows = Invoke-DbQuery "select pg_get_constraintdef(c.oid) as def from pg_constraint c join pg_class t on t.oid = c.conrelid where t.relname = 'games' and c.conname = 'games_live_time_control_check';" $true
$def = [string]$defRows[0].def
if ($def -match '7d' -and $def -match '2m') {
  Write-Output 'OK: games CHECK includes 2m and 7d'
} else {
  Write-Output "FAIL: games CHECK def missing tokens: $def"
  $fail++
}

exit $(if ($fail -gt 0) { 1 } else { 0 })
