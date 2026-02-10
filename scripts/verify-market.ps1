$ErrorActionPreference = 'Stop'

$email = $env:TEST_USER_EMAIL
if (-not $email) {
  $email = 'qa+prod@novanexus-ai.com'
}
$base = 'https://abackend-production.up.railway.app'

$pwSecure = Read-Host -AsSecureString 'Password'
$pw = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($pwSecure)
)

$loginBody = @{ email = $email; password = $pw }

try {
  $login = Invoke-RestMethod -Method Post -Uri ($base + '/v1/auth/login') -ContentType 'application/json' -Body ($loginBody | ConvertTo-Json)
} catch {
  $regBody = @{ email = $email; password = $pw; orgName = 'NovaNexus Test' }
  try {
    $login = Invoke-RestMethod -Method Post -Uri ($base + '/v1/auth/register') -ContentType 'application/json' -Body ($regBody | ConvertTo-Json)
  } catch {
    $login = Invoke-RestMethod -Method Post -Uri ($base + '/v1/auth/login') -ContentType 'application/json' -Body ($loginBody | ConvertTo-Json)
  }
}

$token = $login.data.accessToken
$headers = @{ Authorization = ('Bearer ' + $token) }
$summary = [ordered]@{}

try {
  $candlesUrl = $base + '/v1/market/candles/AAPL?interval=1d' + '&' + 'limit=5'
  $candles = Invoke-RestMethod -Method Get -Uri $candlesUrl -Headers $headers
  $summary.candlesSuccess = $true
  $summary.candlesProvider = $candles.data.provider
  $summary.candlesCount = $candles.data.candles.Count
} catch {
  $summary.candlesSuccess = $false
  if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
    $summary.candlesError = $_.ErrorDetails.Message
  } else {
    $summary.candlesError = $_.Exception.Message
  }
}

try {
  $ind = Invoke-RestMethod -Method Get -Uri ($base + '/v1/market/indicators/AAPL') -Headers $headers
  $summary.indicatorsSuccess = $true
  $summary.indicatorsProvider = $ind.data.indicators.provider
} catch {
  $summary.indicatorsSuccess = $false
  if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
    $summary.indicatorsError = $_.ErrorDetails.Message
  } else {
    $summary.indicatorsError = $_.Exception.Message
  }
}

try {
  $btBody = @{
    symbol = 'AAPL'
    strategyType = 'sma_crossover'
    startDate = '2025-11-01'
    endDate = '2026-02-01'
    initialCapital = 10000
    params = @{ fastPeriod = 20; slowPeriod = 50 }
    name = 'AAPL SMA Test'
  }
  $bt = Invoke-RestMethod -Method Post -Uri ($base + '/v1/backtest') -Headers $headers -ContentType 'application/json' -Body ($btBody | ConvertTo-Json -Depth 5)
  $summary.backtestSuccess = $bt.success
  $summary.backtestId = $bt.data.result.id
} catch {
  $summary.backtestSuccess = $false
  if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
    $summary.backtestError = $_.ErrorDetails.Message
  } else {
    $summary.backtestError = $_.Exception.Message
  }
}

$summary | ConvertTo-Json
