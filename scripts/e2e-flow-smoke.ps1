$ErrorActionPreference = "Stop"

function Get-SessionCookieHeader {
  param(
    [Parameter(Mandatory = $true)]
    [Microsoft.PowerShell.Commands.WebRequestSession]$Session,
    [Parameter(Mandatory = $true)]
    [string]$BaseUrl
  )

  $uri = [System.Uri]$BaseUrl
  $cookies = $Session.Cookies.GetCookies($uri)
  if (-not $cookies -or $cookies.Count -eq 0) {
    throw "No auth cookies found in session for $BaseUrl"
  }

  return (($cookies | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join "; ")
}

function Upload-FileWithKind {
  param(
    [Parameter(Mandatory = $true)]
    [string]$BaseUrl,
    [Parameter(Mandatory = $true)]
    [string]$CookieHeader,
    [Parameter(Mandatory = $true)]
    [string]$JobId,
    [Parameter(Mandatory = $true)]
    [string]$Kind,
    [Parameter(Mandatory = $true)]
    [string]$FilePath
  )

  $responseJson = curl.exe -sS -X POST "$BaseUrl/api/v1/uploads" `
    -H "Cookie: $CookieHeader" `
    -F "jobId=$JobId" `
    -F "kind=$Kind" `
    -F "file=@$FilePath"

  if ($LASTEXITCODE -ne 0) {
    throw "Upload failed for $Kind file."
  }

  return ($responseJson | ConvertFrom-Json)
}

function Assert-BadRequestForAnalyze {
  param(
    [Parameter(Mandatory = $true)]
    [string]$BaseUrl,
    [Parameter(Mandatory = $true)]
    [Microsoft.PowerShell.Commands.WebRequestSession]$Session,
    [Parameter(Mandatory = $true)]
    [string]$JobId,
    [Parameter(Mandatory = $true)]
    [string[]]$UploadIds
  )

  try {
    Invoke-RestMethod -Uri ("$BaseUrl/api/v1/jobs/" + $JobId + "/analyze") -Method Post -ContentType "application/json" -Body (@{
      logUploadIds = $UploadIds
    } | ConvertTo-Json) -WebSession $Session | Out-Null
    throw "Expected analyze request to fail with HTTP 400, but it succeeded."
  } catch {
    $statusCode = [int]$_.Exception.Response.StatusCode
    if ($statusCode -ne 400) {
      throw "Expected HTTP 400 for invalid analyze request, got HTTP $statusCode"
    }
  }
}

$email = "tester+$(Get-Date -Format yyyyMMddHHmmss)@example.com"
$baseUrl = "http://localhost:8080"
$start = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/start" -Method Post -ContentType "application/json" -Body (@{ email = $email } | ConvertTo-Json)
$token = $start.debugToken
if (-not $token) { throw "No debugToken returned from auth/start. Start backend with DEV_DEBUG_AUTH_START_TOKEN=true (non-production only)." }

$sess = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/api/v1/auth/verify" -Method Post -ContentType "application/json" -Body (@{ token = $token } | ConvertTo-Json) -WebSession $sess | Out-Null

$me = Invoke-RestMethod -Uri "$baseUrl/api/v1/me" -Method Get -WebSession $sess
$job = Invoke-RestMethod -Uri "$baseUrl/api/v1/jobs" -Method Post -ContentType "application/json" -Body (@{
  serviceType = "LOG_REVIEW"
  platform = "GM"
  engineFamily = "LS"
  vehicle = "2003 Silverado 5.3"
  ecu = "P01"
  notes = "flow test"
} | ConvertTo-Json) -WebSession $sess

$cookieHeader = Get-SessionCookieHeader -Session $sess -BaseUrl $baseUrl
$fixturePath = (Resolve-Path (Join-Path $PSScriptRoot "..\validation.pass.gm_ls.json")).Path

$logUpload = Upload-FileWithKind -BaseUrl $baseUrl -CookieHeader $cookieHeader -JobId $job.job.id -Kind "LOG" -FilePath $fixturePath
$tuneUpload = Upload-FileWithKind -BaseUrl $baseUrl -CookieHeader $cookieHeader -JobId $job.job.id -Kind "TUNE" -FilePath $fixturePath

$logUploadId = [string]$logUpload.uploadId
$tuneUploadId = [string]$tuneUpload.uploadId
if ([string]::IsNullOrWhiteSpace($logUploadId)) { throw "LOG upload did not return uploadId." }
if ([string]::IsNullOrWhiteSpace($tuneUploadId)) { throw "TUNE upload did not return uploadId." }
$logUploadId = $logUploadId.Trim()
$tuneUploadId = $tuneUploadId.Trim()

Assert-BadRequestForAnalyze -BaseUrl $baseUrl -Session $sess -JobId $job.job.id -UploadIds @($tuneUploadId)

$an = Invoke-RestMethod -Uri ("$baseUrl/api/v1/jobs/" + $job.job.id + "/analyze") -Method Post -ContentType "application/json" -Body (@{
  logUploadIds = @($logUploadId)
} | ConvertTo-Json) -WebSession $sess

Start-Sleep -Milliseconds 1300

$run = Invoke-RestMethod -Uri ("$baseUrl/api/v1/runs/" + $an.runId) -Method Get -WebSession $sess
$val = Invoke-RestMethod -Uri ("$baseUrl/api/v1/jobs/" + $job.job.id + "/validation?runId=" + $an.runId) -Method Get -WebSession $sess
$find = Invoke-RestMethod -Uri ("$baseUrl/api/v1/jobs/" + $job.job.id + "/findings?runId=" + $an.runId) -Method Get -WebSession $sess

$diff = Invoke-RestMethod -Uri ("$baseUrl/api/v1/jobs/" + $job.job.id + "/diffsets/generate") -Method Post -ContentType "application/json" -Body (@{
  runId = $an.runId
  generator = "GM_LS_MAF_V1"
  options = @{ mode = "AUTO" }
} | ConvertTo-Json -Depth 5) -WebSession $sess

$sum = Invoke-RestMethod -Uri ("$baseUrl/api/v1/diffsets/" + $diff.diffSetId + "/export/summary") -Method Post -ContentType "application/json" -Body "{}" -WebSession $sess
$csv = Invoke-WebRequest -UseBasicParsing -Uri ("$baseUrl/api/v1/diffsets/" + $diff.diffSetId + "/export/csv") -Method Post -ContentType "application/json" -Body (@{
  includeSuggested = $false
  minConfidence = 0.45
} | ConvertTo-Json) -WebSession $sess

[PSCustomObject]@{
  meEmail = $me.email
  jobId = $job.job.id
  runId = $an.runId
  runStatus = $run.status
  tuneAnalyzeRejected = $true
  validationLoaded = ($null -ne $val)
  findingsLoaded = ($null -ne $find)
  diffSetId = $diff.diffSetId
  summaryChars = $sum.text.Length
  csvStatus = $csv.StatusCode
} | ConvertTo-Json -Depth 5
