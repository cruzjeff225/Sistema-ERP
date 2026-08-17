$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = "C:\Users\chica\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$nodeDir = Split-Path -Parent $node

$env:Path = "$nodeDir;C:\Windows\System32;C:\Windows"
$env:CI = "true"

Set-Location (Join-Path $root "backend")
$log = Join-Path $root ("backend-stable-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
& $node "dist\src\main.js" *> $log
