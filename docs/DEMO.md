# Nova Hub Demo Guide

## Golden Path Demo

This guide walks through a complete demo of Nova Hub's capabilities.

### Prerequisites

Nova Hub is running:
```powershell
.\scripts\RUN_NOVA.ps1
```

### Step 1: Login

Open the API docs at http://localhost:8000/docs

Or use curl:
```powershell
$response = Invoke-RestMethod -Uri "http://localhost:8000/api/auth/login" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"username": "admin", "password": "admin123"}' `
  -SessionVariable session

$csrf = $response.csrf_token
Write-Host "CSRF Token: $csrf"
```

**Expected**: Login succeeds, returns user info and CSRF token.

### Step 2: View Governance State

```powershell
Invoke-RestMethod -Uri "http://localhost:8000/api/governance" `
  -WebSession $session
```

**Expected**: Shows default safe policy:
- `no_real_money: true`
- `automation_allowed: false`
- `kill_switch.active: false`
- `arm.armed: false`

### Step 3: Create a Trade Analysis Task

```powershell
$task = Invoke-RestMethod -Uri "http://localhost:8000/api/tasks" `
  -Method POST `
  -ContentType "application/json" `
  -Headers @{"X-CSRF-Token" = $csrf} `
  -Body '{"mode": "recommend", "bot": "trade", "action": "analyze", "input_data": {"symbol": "DEMO"}}' `
  -WebSession $session

Write-Host "Task ID: $($task.task_id)"
```

**Expected**: Task created with status "pending".

### Step 4: Check Task Result

Wait a moment for the worker to process, then:
```powershell
$taskId = $task.task_id
Invoke-RestMethod -Uri "http://localhost:8000/api/tasks/$taskId" `
  -WebSession $session
```

**Expected**: Task completed with analysis result including:
- Signal (buy/sell/hold)
- Technical indicators (RSI, ADX, VWAP)
- Checklist and score

### Step 5: View Events

```powershell
Invoke-RestMethod -Uri "http://localhost:8000/api/events?limit=10" `
  -WebSession $session
```

**Expected**: Events including:
- `task.created`
- Login events
- Demo seed events

### Step 6: Verify Event Chain

```powershell
Invoke-RestMethod -Uri "http://localhost:8000/api/events/verify" `
  -WebSession $session
```

**Expected**: `{"valid": true, "error": null, ...}`

### Step 7: Test Kill Switch

```powershell
# Activate kill switch
Invoke-RestMethod -Uri "http://localhost:8000/api/governance/kill-switch" `
  -Method POST `
  -ContentType "application/json" `
  -Headers @{"X-CSRF-Token" = $csrf} `
  -Body '{"active": true, "reason": "Demo test"}' `
  -WebSession $session
```

**Expected**: `{"kill_switch_active": true}`

Now try to create an AUTOMATE task:
```powershell
try {
  Invoke-RestMethod -Uri "http://localhost:8000/api/tasks" `
    -Method POST `
    -ContentType "application/json" `
    -Headers @{"X-CSRF-Token" = $csrf} `
    -Body '{"mode": "automate", "bot": "trade", "action": "analyze", "input_data": {}}' `
    -WebSession $session
} catch {
  Write-Host "Blocked as expected: $($_.Exception.Message)"
}
```

**Expected**: 403 Forbidden - Kill switch is active.

Deactivate:
```powershell
Invoke-RestMethod -Uri "http://localhost:8000/api/governance/kill-switch" `
  -Method POST `
  -ContentType "application/json" `
  -Headers @{"X-CSRF-Token" = $csrf} `
  -Body '{"active": false}' `
  -WebSession $session
```

### Step 8: Test RBAC

Login as viewer:
```powershell
$viewerSession = $null
$viewerResponse = Invoke-RestMethod -Uri "http://localhost:8000/api/auth/login" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"username": "viewer", "password": "viewer123"}' `
  -SessionVariable viewerSession

$viewerCsrf = $viewerResponse.csrf_token
```

Try to create a task (should fail):
```powershell
try {
  Invoke-RestMethod -Uri "http://localhost:8000/api/tasks" `
    -Method POST `
    -ContentType "application/json" `
    -Headers @{"X-CSRF-Token" = $viewerCsrf} `
    -Body '{"mode": "recommend", "bot": "trade", "action": "analyze", "input_data": {}}' `
    -WebSession $viewerSession
} catch {
  Write-Host "RBAC working: $($_.Exception.Message)"
}
```

**Expected**: 403 Forbidden - Requires admin or operator role.

### Step 9: Export Events

```powershell
Invoke-WebRequest -Uri "http://localhost:8000/api/events/export" `
  -WebSession $session `
  -OutFile ".\data\exports\events_demo.ndjson"

Get-Content ".\data\exports\events_demo.ndjson" | Select-Object -First 5
```

**Expected**: NDJSON file with header and events.

### Step 10: Test Other Bots

**Store Bot - List Products:**
```powershell
Invoke-RestMethod -Uri "http://localhost:8000/api/tasks" `
  -Method POST `
  -ContentType "application/json" `
  -Headers @{"X-CSRF-Token" = $csrf} `
  -Body '{"mode": "recommend", "bot": "store", "action": "list_products", "input_data": {}}' `
  -WebSession $session
```

**Social Bot - Generate Content:**
```powershell
Invoke-RestMethod -Uri "http://localhost:8000/api/tasks" `
  -Method POST `
  -ContentType "application/json" `
  -Headers @{"X-CSRF-Token" = $csrf} `
  -Body '{"mode": "recommend", "bot": "social", "action": "generate_content", "input_data": {"template": "product_launch", "variables": {"product": "Nova Hub", "description": "Your automation OS"}}}' `
  -WebSession $session
```

**Ops Bot - Health Check:**
```powershell
Invoke-RestMethod -Uri "http://localhost:8000/api/tasks" `
  -Method POST `
  -ContentType "application/json" `
  -Headers @{"X-CSRF-Token" = $csrf} `
  -Body '{"mode": "recommend", "bot": "ops", "action": "health_check", "input_data": {}}' `
  -WebSession $session
```

## Demo Complete

You have successfully demonstrated:
- ✅ Authentication with session cookies
- ✅ Task creation and execution
- ✅ Event sourcing with hash chain
- ✅ Kill switch governance
- ✅ RBAC enforcement
- ✅ Event export
- ✅ All four bots
