# Open Agents SDLC

**Make AI-assisted software delivery visible, reviewable, and repeatable.**

Open Agents SDLC is a local-first visual workspace for building and running software delivery workflows with AI agents. Connect planning, implementation, review, human approval, and integrations as explicit stages. Run agents against a real project workspace, follow their output and logs as work happens, and inspect what succeeded or failed when a run ends.

Instead of treating an agent run as a black box, Open Agents SDLC gives each workflow a visible path:

**Request → Plan → Implement → Review → Approve → Integrate**

Teams can also organize work on customizable Kanban boards and let agents read or update those boards through the built-in Model Context Protocol (MCP) server.

## Why Open Agents SDLC

AI coding workflows are easier to trust when people can see how work moves from a request to a result. Open Agents SDLC brings the workflow, agent configuration, execution output, approval gates, and project board into one local interface. The same run can be followed live in the browser and reviewed later through its saved history and logs.

The project is designed for local development: the application and agent runners live in Docker, while the selected codebase is mounted into the execution workspace. Workflow data, agents, Skills, datasets, Kanban boards, credentials, and run history persist in a Docker volume.

## What you can do

- **Design visual workflows.** Add agent, sub-workflow, approval, condition, and integration stages; connect them into a directed workflow; and keep multiple workflows in one workspace.
- **Use the agent runner that fits the task.** Configure Codex CLI, Claude Code, or OpenCode with a model, effort level, prompt, credentials, reusable agent profile, and local context datasets.
- **Follow executions as they happen.** See the active stage, progress, standard output and error output, approvals, and failure details. Inspect a stage's latest result and review saved run history.
- **Keep consequential actions reviewable.** Place human approval gates before integrations that run commands in the project workspace.
- **Coordinate work on Kanban.** Create boards with custom columns, lanes, labels, and fields; link cards to workflows; add comments and related cards; and launch a card's selected workflow.
- **Connect agents through MCP.** The local MCP server exposes self-describing tools for reading and maintaining Kanban boards and cards, including starting an explicitly selected card workflow.
- **Adapt the workspace.** Configure runtime defaults and Kubernetes execution, switch between dark and light themes, and choose English, Spanish, or Brazilian Portuguese for the interface.
- **Navigate large workflows.** Arrange stages automatically, fit the graph to the canvas, zoom from 40% to 200%, and pan around the workflow.

## Quick start with Docker

Requirements: Docker Desktop with Docker Compose. On Windows, run the included startup script from the project folder:

```powershell
.\start.ps1
```

Open [http://localhost:8080](http://localhost:8080). The first image build installs the supported agent CLIs and runtime tools.

By default, the project directory is mounted at `/workspace`. To run workflows against another local project, set `WORKSPACE_PATH` before starting:

```powershell
$env:WORKSPACE_PATH = 'C:/Projects/my-application'
.\start.ps1
```

The Docker volume `open_agents_data` keeps application data when the container stops. To stop the application without removing that volume:

```powershell
docker compose down
```

Follow the application console in real time:

```powershell
docker compose logs --tail=100 --follow
```

## Configure an agent

Open **Agents** to create a reusable profile, or select an agent stage in the workflow editor to configure it directly. Choose a runner, model, effort, prompt, optional datasets and Skills, and the credential the runner should use.

Add OpenAI or Anthropic API credentials in **Connections** or from an agent stage. Credential values are encrypted with AES-256-GCM in persistent storage; the API returns connection metadata rather than the secret. OpenCode uses the credential for the selected provider.

When `~/.codex/auth.json` is present, `start.ps1` mounts it read-only for Codex CLI use. The file is not copied to the persistent application volume. Claude Code requires an Anthropic API key in this setup.

Agent commands run in the application container with access to the mounted workspace and configured credentials. Only run workflows on repositories and with credentials you trust. The web server binds to `127.0.0.1` by default; do not expose this development instance directly to the public internet.

## Kanban MCP server

The MCP endpoint is available at:

```text
http://127.0.0.1:8080/mcp
```

The server uses Streamable HTTP and exposes tools for listing and reading boards, creating and updating boards and cards, moving cards, adding comments, linking related cards, and running the workflow selected on a card. Open **Connections** in the interface for the endpoint and connection guidance.

A default **Kanban MCP Guide** Skill is added to the Skill library. It explains how agents should inspect a board before changing it, use existing identifiers, preserve unrelated card data, and access the MCP endpoint from the local Docker runner. The built-in Skill is assigned to the default agents and new agent stages.

For a direct `tools/list` request from PowerShell:

```powershell
$headers = @{
  Accept = 'application/json, text/event-stream'
  'MCP-Protocol-Version' = '2026-07-28'
  'Mcp-Method' = 'tools/list'
  Origin = 'http://localhost'
}
$metadata = @{
  'io.modelcontextprotocol/protocolVersion' = '2026-07-28'
  'io.modelcontextprotocol/clientInfo' = @{ name = 'open-agents-sdlc-client'; version = '1.0.0' }
  'io.modelcontextprotocol/clientCapabilities' = @{}
}
$body = @{
  jsonrpc = '2.0'
  id = 1
  method = 'tools/list'
  params = @{ _meta = $metadata }
} | ConvertTo-Json -Depth 8
Invoke-RestMethod -Uri 'http://127.0.0.1:8080/mcp' -Method Post -ContentType 'application/json' -Headers $headers -Body $body
```

When workflows run in Kubernetes, `127.0.0.1` refers to the worker pod. Configure an MCP address that is reachable from the cluster rather than relying on the Docker-local endpoint.

## Kubernetes execution

Select **Kubernetes** in the main workflow's execution settings to run work in a temporary Kubernetes Job. Configure the namespace, a worker image accessible to the cluster, and a bound PVC containing the project workspace. Sub-workflows follow the main workflow's execution target.

On Windows, `start.ps1` mounts `%USERPROFILE%\.kube\config` read-only when it exists. Set `KUBECONFIG_PATH` to use a different kubeconfig. The local workspace is not copied into the PVC automatically. See [kubernetes/open-agents-sdlc-rbac.yaml](kubernetes/open-agents-sdlc-rbac.yaml) for an example Role and RoleBinding, and adjust the namespace and identity for your cluster.

## Project structure

```text
server/
  server.js                 HTTP API, persistence, workflow runtime, and MCP server
  command-worker.js         Agent and integration command execution
src/
  app.js                    Browser application and workflow editor
  canvas-navigation.js      Canvas zoom, fit, and panning
  graph-layout.js           Workflow ordering and automatic layout
  i18n.js                   English, Spanish, and Brazilian Portuguese
  styles.css                Interface styles and execution states
testcontainers/
  validate.js               Container-level integration validation
```

## Run the tests

```powershell
npm test
npm run test:containers
```

The container validation requires Docker Desktop and the `open-agents-sdlc:runtime` image built by `start.ps1`. Running a real model also requires a working API credential or an available Codex OAuth session.

## Optional .NET example

`HelloWorld.csproj` is a small .NET 9 console example included in the repository. Run it with the .NET 9 SDK:

```bash
dotnet run --project HelloWorld.csproj
```
