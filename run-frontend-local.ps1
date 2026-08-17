$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = "C:\Users\chica\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$nodeDir = Split-Path -Parent $node

$env:Path = "$nodeDir;C:\Windows\System32;C:\Windows"

Set-Location (Join-Path $root "frontend")
$log = Join-Path $root ("frontend-stable-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
& $node "node_modules\vite\bin\vite.js" "--host" "localhost" "--port" "5173" *> $log
