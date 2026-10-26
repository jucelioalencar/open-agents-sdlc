import assert from 'node:assert/strict';
import { GenericContainer, Wait } from 'testcontainers';

let container;
let logStream;

async function request(base, route, options) {
  const response = await fetch(`${base}${route}`, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${options?.method || 'GET'} ${route} → ${response.status}: ${body.error || response.statusText}`);
  return body;
}

async function mcpRequest(base, method, params = {}, id = 1) {
  const headers = {
    accept: 'application/json, text/event-stream',
    'content-type': 'application/json',
    'mcp-protocol-version': '2026-07-28',
    'mcp-method': method,
    origin: 'http://localhost'
  };
  if (method === 'tools/call' && params.name) headers['mcp-name'] = params.name;
  const metadata = {
    'io.modelcontextprotocol/protocolVersion': '2026-07-28',
    'io.modelcontextprotocol/clientInfo': { name: 'open-agents-sdlc-testcontainers', version: '1.0.0' },
    'io.modelcontextprotocol/clientCapabilities': {}
  };
  const response = await fetch(`${base}/mcp`, {
    method: 'POST', headers,
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params: { ...params, _meta: metadata } })
  });
  const body = await response.json().catch(async () => ({ raw: await response.text() }));
  if (!response.ok) throw new Error(`MCP ${method} → ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

function mcpToolResult(response) {
  const result = response.result;
  if (result?.isError) throw new Error(result.content?.map(item => item.text).join('\n') || 'A ferramenta MCP retornou erro.');
  return result?.structuredContent || JSON.parse(result.content[0].text);
}

async function waitForRun(base, runId, predicate, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  let run;
  while (Date.now() < deadline) {
    run = await request(base, `/api/runs/${runId}`);
    if (predicate(run)) return run;
    if (['failed', 'cancelled'].includes(run.status)) throw new Error(`A execução terminou como ${run.status}: ${run.error || ''}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timeout aguardando execução; último estado: ${run?.status || 'sem resposta'}`);
}

try {
  console.log('\n[TESTCONTAINERS] Iniciando a imagem open-agents-sdlc:runtime…');
  container = await new GenericContainer('open-agents-sdlc:runtime')
    .withEnvironment({ PORT: '8080', DATA_DIR: '/data', WORKSPACE_DIR: '/workspace', CODEX_HOME: '/tmp/test-codex' })
    .withExposedPorts(8080)
    .withStartupTimeout(180_000)
    .withWaitStrategy(Wait.forHttp('/api/health', 8080).forStatusCode(200))
    .start();

  const liveLogs = await container.logs();
  logStream = liveLogs.on('data', chunk => process.stdout.write(`[APP CONTAINER] ${chunk.toString().trimEnd()}\n`));
  liveLogs.on('err', chunk => process.stderr.write(`[APP CONTAINER] ${chunk.toString().trimEnd()}\n`));
  const base = `http://${container.getHost()}:${container.getMappedPort(8080)}`;
  const health = await request(base, '/api/health');
  assert.equal(health.name, 'Open Agents SDLC');
  console.log('[PASS] Container sobe e a API de saúde responde.');
  const page = await fetch(base); const html = await page.text();
  assert.equal(page.status, 200); assert.match(html, /id="newWorkflowBoard"/); assert.match(html, /id="boardSettingsForm"/); assert.match(html, /id="boardSettingsTabs"/); assert.match(html, /id="boardSettingsPanelGeneral"/); assert.match(html, /id="boardSettingsPanelWorkflows"/); assert.match(html, /id="boardSettingsPanelStructure"/); assert.match(html, /id="boardSettingsPanelCards"/); assert.match(html, /id="boardWorkflows" multiple/); assert.match(html, /id="boardColumnsEditor"/); assert.match(html, /id="boardFieldsEditor"/); assert.match(html, /role="tablist" aria-label="Categorias de configuração"/); assert.match(html, /id="settingsTabAppearance"/); assert.match(html, /id="settingsPanelAppearance"/); assert.match(html, /id="cardTabHistory"/); assert.match(html, /id="cardTabComments"/); assert.match(html, /id="cardTabRelated"/); assert.match(html, /id="cardAttachments"/);
  console.log('[PASS] A interface no container oferece abas de configurações gerais, quadro e tema, além dos recursos de cartões.');

  const runtime = await request(base, '/api/runtime/frameworks');
  assert.equal(runtime.frameworks.length, 11);
  const unavailable = runtime.frameworks.filter(framework => !framework.installed);
  assert.deepEqual(unavailable.map(framework => framework.id), [], `Toolchains ausentes na imagem: ${JSON.stringify(unavailable)}`);
  for (const [label, command] of [
    ['.NET SDK 9 e 10', ['dotnet', '--list-sdks']], ['Node.js', ['node', '--version']], ['Python', ['python3', '--version']],
    ['Rust', ['rustc', '--version']], ['PHP', ['php', '--version']], ['Perl', ['perl', '-e', 'print $^V']], ['C++', ['g++', '--version']],
    ['Go', ['go', 'version']], ['Java', ['javac', '-version']], ['Ruby', ['ruby', '--version']]
  ]) {
    const probe = await container.exec(command);
    assert.equal(probe.exitCode, 0, `${label} falhou: ${probe.stderr}`);
    assert.ok(probe.stdout.trim() || probe.stderr.trim(), `${label} não retornou a versão instalada.`);
  }
  const dotnetSdks = await container.exec(['dotnet', '--list-sdks']);
  assert.match(dotnetSdks.stdout, /(^|\n)9\./);
  assert.match(dotnetSdks.stdout, /(^|\n)10\./);
  console.log('[PASS] A imagem contém e executa .NET SDK 9/10, Node.js, Python, Rust, PHP, Perl, C/C++, Go, Java e Ruby.');

  const runners = (await request(base, '/api/runners')).runners;
  assert.deepEqual(runners.filter(runner => !runner.installed).map(runner => runner.id), [], `Runners ausentes: ${JSON.stringify(runners)}`);
  for (const [label, command] of [['Codex CLI', 'codex'], ['Claude Code', 'claude'], ['OpenCode', 'opencode']]) {
    const probe = await container.exec([command, '--version']);
    assert.equal(probe.exitCode, 0, `${label} falhou ao iniciar: ${probe.stderr}`);
    assert.ok(probe.stdout.trim() || probe.stderr.trim(), `${label} não retornou a versão instalada.`);
  }
  console.log('[PASS] Codex CLI, Claude Code e OpenCode iniciam na imagem.');

  const safeDirectory = await container.exec(['git', 'config', '--global', '--get-all', 'safe.directory']);
  assert.equal(safeDirectory.exitCode, 0); assert.match(safeDirectory.stdout, /\/workspace/);
  await container.exec(['git', '-C', '/workspace', 'init', '-q']);
  console.log('[PASS] O workspace montado é aceito pelo Git dentro do container.');

  const workflowA = await request(base, '/api/workflows', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Validação Testcontainers A' }) });
  const workflowB = await request(base, '/api/workflows', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Validação Testcontainers B' }) });
  assert.notEqual(workflowA.id, workflowB.id);
  const templates = await request(base, '/api/workflow-templates');
  assert.deepEqual(templates.map(template => template.id), ['sdlc-standard', 'blank', 'code-review']);
  assert.equal(templates.find(template => template.id === 'sdlc-standard').isDefault, true);
  const blankTemplate = await request(base, '/api/workflows', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Validação Template em branco', templateId: 'blank' }) });
  assert.equal(blankTemplate.nodes.length, 1); assert.equal(blankTemplate.nodes[0].type, 'trigger'); assert.deepEqual(blankTemplate.edges, []);
  const reviewTemplate = await request(base, '/api/workflows', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Validação Template revisão', templateId: 'code-review' }) });
  assert.deepEqual(reviewTemplate.edges, [['trigger', 'review'], ['review', 'approval']]);
  await request(base, `/api/workflows/${workflowA.id}/activate`, { method: 'POST' });
  assert.equal((await request(base, '/api/workflow')).id, workflowA.id);
  assert.equal((await request(base, '/api/workflows')).workflows.length, 5);
  console.log('[PASS] Workflows independentes, templates SDLC, revisão e canvas em branco podem ser criados e alternados.');

  const board = await request(base, '/api/boards', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Quadro Testcontainers', workflowId: workflowA.id, workflowIds: [workflowA.id, workflowB.id], columns: [{ id: 'ready', name: 'Pronto', color: '#345678' }, { id: 'doing', name: 'Em execução', color: '#43b78d' }], lanes: [{ id: 'general', name: 'Geral' }, { id: 'priority', name: 'Prioridade' }], labels: [{ id: 'mcp', name: 'MCP', color: '#43b78d' }], customFields: [{ id: 'estimate', name: 'Estimativa', type: 'number', required: true }] }) });
  const boardWorkflow = await request(base, '/api/workflows', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Workflow de cartão Testcontainers', templateId: 'blank', boardId: board.id }) });
  assert.equal((await request(base, `/api/boards/${board.id}`)).workflowId, boardWorkflow.id); assert.equal((await request(base, '/api/boards')).some(item => item.id === board.id), true);
  const discovery = await mcpRequest(base, 'server/discover', {}, 1);
  assert.ok(discovery.result.supportedVersions.includes('2026-07-28'));
  const mcpTools = (await mcpRequest(base, 'tools/list', {}, 2)).result.tools;
  assert.ok(mcpTools.some(tool => tool.name === 'kanban_create_card')); assert.ok(mcpTools.some(tool => tool.name === 'kanban_run_card'));
  assert.ok(mcpTools.find(tool => tool.name === 'kanban_create_board').inputSchema.properties.columns);
  assert.ok(mcpTools.find(tool => tool.name === 'kanban_create_board').inputSchema.properties.lanes);
  assert.ok(mcpTools.find(tool => tool.name === 'kanban_create_card').inputSchema.properties.dueDate);
  const mcpBoard = mcpToolResult(await mcpRequest(base, 'tools/call', { name: 'kanban_create_board', arguments: { name: 'Quadro via MCP', workflowId: workflowA.id, workflowIds: [workflowA.id, workflowB.id], columns: [{ id: 'backlog', name: 'Backlog', color: '#6482de' }, { id: 'doing', name: 'Em execução', color: '#8f72ed' }], lanes: [{ id: 'product', name: 'Produto', color: '#43b78d' }, { id: 'bugs', name: 'Defeitos', color: '#df687b' }], labels: [{ id: 'security', name: 'Segurança', color: '#df687b' }], customFields: [{ id: 'estimate', name: 'Estimativa', type: 'number', required: true }] } }, 3));
  assert.deepEqual(mcpBoard.columns.map(item => item.name), ['Backlog', 'Em execução']);
  assert.deepEqual(mcpBoard.lanes.map(item => item.name), ['Produto', 'Defeitos']); assert.deepEqual(mcpBoard.workflowIds, [workflowA.id, workflowB.id]); assert.equal(mcpBoard.labels[0].name, 'Segurança'); assert.equal(mcpBoard.customFields[0].type, 'number');
  const mcpBoardUpdate = mcpToolResult(await mcpRequest(base, 'tools/call', { name: 'kanban_update_board', arguments: { boardId: mcpBoard.id, name: 'Quadro MCP atualizado', columns: [{ id: 'backlog', name: 'Backlog', color: '#6482de' }, { id: 'doing', name: 'Em execução', color: '#8f72ed' }, { id: 'review', name: 'Revisão', color: '#e0a647' }], lanes: [{ id: 'product', name: 'Produto', color: '#43b78d' }] } }, 4));
  assert.equal(mcpBoardUpdate.name, 'Quadro MCP atualizado'); assert.equal(mcpBoardUpdate.columns.length, 3); assert.equal(mcpBoardUpdate.lanes.length, 1);
  const mcpCard = mcpToolResult(await mcpRequest(base, 'tools/call', { name: 'kanban_create_card', arguments: { boardId: board.id, title: 'Validar MCP dentro do container', workflowId: boardWorkflow.id, columnId: 'ready', laneId: 'general', priority: 'high', labels: ['mcp'], dueDate: '2026-12-15', color: '#f0c040', customFields: { estimate: 3 } } }, 5));
  assert.equal(mcpCard.dueDate, '2026-12-15'); assert.equal(mcpCard.color, '#f0c040'); assert.equal(mcpCard.customFields.estimate, 3);
  const movedCard = await request(base, `/api/boards/${board.id}/cards/${mcpCard.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ columnId: 'doing', laneId: 'priority' }) });
  assert.equal(movedCard.columnId, 'doing'); assert.equal(movedCard.laneId, 'priority');
  const relatedCard = await request(base, `/api/boards/${board.id}/cards`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Cartão relacionado', customFields: { estimate: 1 } }) });
  const linkResult = mcpToolResult(await mcpRequest(base, 'tools/call', { name: 'kanban_link_cards', arguments: { boardId: board.id, cardId: mcpCard.id, relatedCardIds: [relatedCard.id] } }, 6));
  assert.deepEqual(linkResult.relatedCardIds, [relatedCard.id]);
  const commentResult = mcpToolResult(await mcpRequest(base, 'tools/call', { name: 'kanban_add_comment', arguments: { boardId: board.id, cardId: mcpCard.id, body: 'Comentário verificado no container.' } }, 7));
  assert.equal(commentResult.body, 'Comentário verificado no container.');
  const attachment = await request(base, `/api/boards/${board.id}/cards/${mcpCard.id}/attachments`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename: 'container-log.txt', mimeType: 'text/plain', data: Buffer.from('arquivo persistente').toString('base64') }) });
  const attachmentDownload = await fetch(base + attachment.url); assert.equal(await attachmentDownload.text(), 'arquivo persistente');
  const mcpRun = mcpToolResult(await mcpRequest(base, 'tools/call', { name: 'kanban_run_card', arguments: { boardId: board.id, cardId: mcpCard.id } }, 6)); const boardRun = await waitForRun(base, mcpRun.id, value => ['completed', 'failed'].includes(value.status));
  assert.equal(boardRun.status, 'completed', boardRun.error); assert.equal(boardRun.workflowId, boardWorkflow.id);
  const linkedWorkflowDelete = await fetch(`${base}/api/workflows/${boardWorkflow.id}`, { method: 'DELETE' }); assert.equal(linkedWorkflowDelete.status, 409);
  assert.equal((await request(base, `/api/boards/${board.id}/cards/${mcpCard.id}`, { method: 'DELETE' })).ok, true);
  assert.equal((await request(base, `/api/boards/${board.id}/cards/${relatedCard.id}`, { method: 'DELETE' })).ok, true);
  assert.equal((await request(base, `/api/boards/${board.id}`, { method: 'DELETE' })).ok, true);
  assert.equal((await request(base, `/api/workflows/${boardWorkflow.id}`, { method: 'DELETE' })).ok, true);
  assert.equal((await request(base, `/api/boards/${mcpBoard.id}`, { method: 'DELETE' })).ok, true);
  console.log('[PASS] Quadros personalizáveis, cartões, vínculo ao workflow, execução e ferramentas MCP funcionam no container.');

  const settings = await request(base, '/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ maxConcurrentRuns: 2, integrationTimeoutMinutes: 3 }) });
  assert.equal(settings.maxConcurrentRuns, 2); assert.equal((await request(base, '/api/settings')).integrationTimeoutMinutes, 3);
  const dataset = await request(base, '/api/datasets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Critérios Testcontainers', content: 'A execução deve deixar logs de stdout e stderr.' }) });
  const agent = await request(base, '/api/agents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Agente Testcontainers', runner: 'codex', model: 'gpt-6-luna', effort: 'high', harness: 'codex', prompt: 'Valide a execução do workflow.', datasetIds: [dataset.id] }) });
  assert.equal((await request(base, '/api/agents')).some(item => item.id === agent.id), true);
  workflowB.name = 'Validação Testcontainers B com agente';
  workflowB.nodes = [
    { id: 'trigger', type: 'trigger', name: 'Entrada', config: {} },
    { id: 'reviewer', type: 'agent', name: 'Revisão com contexto', config: { runner: agent.runner, model: agent.model, effort: agent.effort, prompt: agent.prompt, datasetIds: [dataset.id] } }
  ];
  workflowB.edges = [['trigger', 'reviewer']];
  assert.equal((await request(base, `/api/workflows/${workflowB.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(workflowB) })).nodes.find(node => node.id === 'reviewer').config.datasetIds[0], dataset.id);
  const protectedDataset = await fetch(`${base}/api/datasets/${dataset.id}`, { method: 'DELETE' });
  assert.equal(protectedDataset.status, 409);
  assert.equal((await request(base, `/api/agents/${agent.id}`, { method: 'DELETE' })).ok, true);
  const stillProtectedDataset = await fetch(`${base}/api/datasets/${dataset.id}`, { method: 'DELETE' });
  assert.equal(stillProtectedDataset.status, 409);
  console.log('[PASS] Configurações, cadastro de agentes, etapa editável e proteção de datasets vinculados.');
  workflowA.name = 'Validação Testcontainers A atualizada';
  workflowA.execution = { target: 'container', frameworks: ['dotnet9', 'dotnet10', 'nodejs', 'python', 'cpp'] };
  workflowA.nodes = [
    { id: 'trigger', type: 'trigger', name: 'Entrada', config: {} },
    { id: 'approval', type: 'approval', name: 'Aprovação', config: { message: 'Aprovar teste de integração.' } },
    { id: 'integration', type: 'integration', name: 'Integração Git', config: { command: "git status --short; echo tc-stdout-ok; echo tc-stderr-check >&2", requiresApproval: true } }
  ];
  workflowA.edges = [['trigger', 'approval'], ['approval', 'integration']];
  assert.equal((await request(base, `/api/workflows/${workflowA.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(workflowA) })).name, workflowA.name);
  console.log('[PASS] Agentes são cadastrados, listados e associados ao workflow.');

  const run = await request(base, '/api/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: 'Validar fluxo no Testcontainers', workflowId: workflowA.id }) });
  const stream = await fetch(`${base}/api/runs/${run.id}/events`);
  assert.match(stream.headers.get('content-type'), /text\/event-stream/);
  const reader = stream.body.getReader(); const decoder = new TextDecoder(); let packets = '';
  while (!packets.includes('event: snapshot')) { const chunk = await reader.read(); if (chunk.done) throw new Error('Stream terminou antes do snapshot.'); packets += decoder.decode(chunk.value, { stream: true }); }
  assert.match(packets, /event: snapshot/);
  const waiting = await waitForRun(base, run.id, value => value.status === 'waiting_approval');
  assert.equal(waiting.workflowId, workflowA.id);
  await request(base, `/api/runs/${run.id}/approve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'approve' }) });
  const completed = await waitForRun(base, run.id, value => ['completed', 'failed'].includes(value.status));
  await reader.cancel();
  assert.equal(completed.status, 'completed', completed.error || 'A integração do workflow falhou.');
  assert.ok(completed.log.some(entry => entry.message.includes('tc-stdout-ok')));
  assert.ok(completed.log.some(entry => entry.message.includes('tc-stderr-check')));
  assert.ok(completed.log.some(entry => entry.message.includes('código 0')));
  assert.ok(completed.log.some(entry => entry.message.includes('.NET SDK 9 disponível no container')));
  assert.ok(completed.log.some(entry => entry.message.includes('.NET SDK 10 disponível no container')));
  console.log('[PASS] Execução, aprovação, integração e logs stdout/stderr em tempo real.');

  assert.equal((await request(base, `/api/workflows/${workflowB.id}`, { method: 'DELETE' })).ok, true);
  assert.equal((await request(base, `/api/datasets/${dataset.id}`, { method: 'DELETE' })).ok, true);
  console.log('[PASS] Agentes e workflows podem ser removidos com segurança.');
  console.log('[TESTCONTAINERS] Todas as verificações passaram.');
} catch (error) {
  console.error('[TESTCONTAINERS] FALHOU:', error);
  if (container) {
    try { const details = await container.logs(); details.on('data', chunk => process.stderr.write(chunk.toString())); }
    catch { /* keep the original failure */ }
  }
  process.exitCode = 1;
} finally {
  logStream?.destroy?.();
  if (container) await container.stop().catch(() => {});
}
