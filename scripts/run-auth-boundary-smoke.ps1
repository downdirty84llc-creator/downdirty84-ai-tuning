param(
  [Parameter(Mandatory = $true)]
  [string]$OwnerCookie,

  [Parameter(Mandatory = $true)]
  [string]$IntruderCookie,

  [Parameter(Mandatory = $true)]
  [string]$OwnerRunId,

  [Parameter(Mandatory = $true)]
  [string]$OwnerDiffSetId,

  [string]$OwnerJobId = "",

  [string]$BaseUrl = "http://localhost:8080"
)

$env:OWNER_COOKIE = $OwnerCookie
$env:INTRUDER_COOKIE = $IntruderCookie
$env:OWNER_RUN_ID = $OwnerRunId
$env:OWNER_DIFFSET_ID = $OwnerDiffSetId
$env:OWNER_JOB_ID = $OwnerJobId
$env:BASE_URL = $BaseUrl

Write-Host "Running auth-boundary smoke test against $BaseUrl"
node scripts/auth-boundary-smoke.mjs

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
