$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $projectRoot
try {
    $composeArgs = @('-f', 'docker-compose.yml')
    $authFile = Join-Path $env:USERPROFILE '.codex/auth.json'
    if (Test-Path -LiteralPath $authFile) {
        $env:CODEX_AUTH_FILE = $authFile.Replace('\', '/')
        $composeArgs += @('-f', 'docker-compose.codex-oauth.yml')
    }

    $kubeconfigPath = $env:KUBECONFIG_PATH
    if (-not $kubeconfigPath) {
        $defaultKubeconfig = Join-Path $env:USERPROFILE '.kube/config'
        if (Test-Path -LiteralPath $defaultKubeconfig) { $kubeconfigPath = $defaultKubeconfig }
    }
    if ($kubeconfigPath) {
        if (-not (Test-Path -LiteralPath $kubeconfigPath)) { throw "Kubeconfig não encontrado: $kubeconfigPath" }
        $kubeconfigPath = (Resolve-Path -LiteralPath $kubeconfigPath).Path
        $env:KUBECONFIG_PATH = $kubeconfigPath.Replace('\', '/')
        $composeArgs += @('-f', 'docker-compose.kubernetes.yml')
    }

    docker compose @composeArgs up --build -d
    if ($LASTEXITCODE -ne 0) { throw 'O Docker Compose não conseguiu iniciar o Open Agents SDLC.' }
    Write-Output 'Open Agents SDLC iniciado em http://localhost:8080'
}
finally {
    Pop-Location
}
