import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAppServer, defaultWorkflow, sortNodes, validateWorkflow } from './server.js';

async function withServer(options, callback) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'open-agents-sdlc-'));
  const server = createAppServer({ dataDir: path.join(root, 'data'), workspaceDir: root, logger: { log() {}, warn() {}, error() {} }, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (route, init) => { const response = await fetch(`${base}${route}`, init); return { status: response.status, body: await response.json() }; };
  try { await callback({ request, root, base }); } finally { await new Promise(resolve => { server.close(resolve); server.closeAllConnections?.(); }); await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); }
}

async function mcpRequest(base, method, params = {}, id = 1) {
  const metadata = {
    'io.modelcontextprotocol/protocolVersion': '2026-07-28',
    'io.modelcontextprotocol/clientInfo': { name: 'open-agents-sdlc-tests', version: '1.0.0' },
    'io.modelcontextprotocol/clientCapabilities': {}
  };
  const headers = { accept: 'application/json, text/event-stream', 'content-type': 'application/json', 'mcp-protocol-version': '2026-07-28', 'mcp-method': method, origin: 'http://localhost' };
  if (method === 'tools/call' && params.name) headers['mcp-name'] = params.name;
  const response = await fetch(`${base}/mcp`, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id, method, params: { ...params, _meta: metadata } }) });
  return { status: response.status, body: await response.json() };
}

async function parseMcpResponse(response) {
  if (response.headers.get('content-type')?.includes('text/event-stream')) {
    const packets = await response.text();
    const data = packets.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim());
    assert.ok(data.length, `Resposta MCP sem evento data: ${packets}`);
    return JSON.parse(data.at(-1));
  }
  return response.json();
}

test('validates workflows and returns nodes in dependency order', () => {
  const nodes = [{ id: 'last', type: 'agent', name: 'Last' }, { id: 'first', type: 'trigger', name: 'First' }];
  assert.deepEqual(sortNodes(nodes, [['first', 'last']]).map(node => node.id), ['first', 'last']);
  assert.throws(() => validateWorkflow({ id: 'cycle', name: 'Cycle', nodes, edges: [['first', 'last'], ['last', 'first']] }), /ciclo/i);
});

test('serves health and persists the editable workflow', async () => {
  await withServer({}, async ({ request }) => {
    const health = await request('/api/health'); assert.equal(health.status, 200); assert.equal(health.body.name, 'Open Agents SDLC');
    const initial = await request('/api/workflow'); assert.equal(initial.body.nodes.find(node => node.id === 'planner').config.model, 'gpt-6-luna');
    initial.body.name = 'Saved workflow';
    assert.equal((await request('/api/workflow', { method: 'PUT', body: JSON.stringify(initial.body), headers: { 'content-type': 'application/json' } })).status, 200);
    assert.equal((await request('/api/workflow')).body.name, 'Saved workflow');
  });
});

test('persists customizable Kanban boards and cards and exposes the MCP tools', async () => {
  await withServer({}, async ({ request, base }) => {
    const existing = await request('/api/workflows'); const previousWorkflowId = existing.body.activeWorkflowId;
    const board = await request('/api/boards', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Produto', description: 'Entrega da equipe', workflowId: previousWorkflowId, columns: [{ id: 'todo', name: 'A fazer', color: '#6482de' }, { id: 'doing', name: 'Em execução', color: '#8f72ed' }], lanes: [{ id: 'general', name: 'Geral' }, { id: 'urgent', name: 'Urgente', color: '#df687b' }] }) });
    assert.equal(board.status, 201); assert.equal((await request('/api/boards')).body[0].workflowId, previousWorkflowId);
    const workflow = await request('/api/workflows', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Workflow do quadro', templateId: 'blank', boardId: board.body.id }) });
    assert.equal(workflow.status, 201); assert.equal((await request(`/api/boards/${board.body.id}`)).body.workflowId, workflow.body.id);
    const missingBoard = await request('/api/workflows', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Workflow com quadro ausente', boardId: 'board-missing' }) });
    assert.equal(missingBoard.status, 404); assert.equal((await request('/api/workflows')).body.workflows.some(item => item.name === 'Workflow com quadro ausente'), false);
    const customBoard = await mcpRequest(base, 'tools/call', { name: 'kanban_create_board', arguments: { name: 'Produto via MCP', workflowId: previousWorkflowId, columns: [{ id: 'ready', name: 'Pronto', color: '#6482de' }, { id: 'doing', name: 'Em execução', color: '#8f72ed' }], lanes: [{ id: 'feature', name: 'Funcionalidade', color: '#43b78d' }, { id: 'bug', name: 'Defeitos', color: '#df687b' }] } }, 3);
    assert.equal(customBoard.status, 200, JSON.stringify(customBoard.body));
    const customBoardResult = customBoard.body.result.structuredContent || JSON.parse(customBoard.body.result.content[0].text);
    assert.equal(customBoardResult.workflowId, previousWorkflowId); assert.deepEqual(customBoardResult.columns.map(item => item.name), ['Pronto', 'Em execução']); assert.deepEqual(customBoardResult.lanes.map(item => item.name), ['Funcionalidade', 'Defeitos']);
    const boardUpdate = await mcpRequest(base, 'tools/call', { name: 'kanban_update_board', arguments: { boardId: board.body.id, name: 'Produto configurado por MCP', columns: [{ id: 'todo', name: 'A fazer', color: '#6482de' }, { id: 'doing', name: 'Em execução', color: '#8f72ed' }, { id: 'review', name: 'Revisão', color: '#e0a647' }], lanes: [{ id: 'general', name: 'Geral', color: '#6482de' }, { id: 'urgent', name: 'Urgente', color: '#df687b' }] } }, 4);
    assert.equal(boardUpdate.status, 200, JSON.stringify(boardUpdate.body));
    const updatedBoard = boardUpdate.body.result.structuredContent || JSON.parse(boardUpdate.body.result.content[0].text);
    assert.equal(updatedBoard.name, 'Produto configurado por MCP'); assert.equal(updatedBoard.columns.length, 3); assert.equal(updatedBoard.lanes.length, 2);
    const createdCard = await mcpRequest(base, 'tools/call', { name: 'kanban_create_card', arguments: { boardId: board.body.id, title: 'Criar painel', description: 'Critério de aceite: funcional', columnId: 'todo', laneId: 'general', priority: 'high', assignee: 'Ana', labels: ['frontend', 'ui'], dueDate: '2026-12-15' } }, 5);
    assert.equal(createdCard.status, 200, JSON.stringify(createdCard.body));
    const card = createdCard.body.result.structuredContent || JSON.parse(createdCard.body.result.content[0].text);
    assert.equal(card.priority, 'high'); assert.deepEqual(card.labels, ['frontend', 'ui']); assert.equal(card.dueDate, '2026-12-15');
    const moved = await mcpRequest(base, 'tools/call', { name: 'kanban_move_card', arguments: { boardId: board.body.id, cardId: card.id, columnId: 'doing', laneId: 'urgent' } }, 6);
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    const updatedCard = await mcpRequest(base, 'tools/call', { name: 'kanban_update_card', arguments: { boardId: board.body.id, cardId: card.id, assignee: 'Bruna', labels: ['frontend', 'kanban'], dueDate: '2026-12-20' } }, 7);
    const cardAfterUpdate = updatedCard.body.result.structuredContent || JSON.parse(updatedCard.body.result.content[0].text);
    assert.equal(cardAfterUpdate.assignee, 'Bruna'); assert.equal(cardAfterUpdate.dueDate, '2026-12-20');
    assert.equal(cardAfterUpdate.columnId, 'doing'); assert.equal(cardAfterUpdate.laneId, 'urgent');
    const listed = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } } }) });
    assert.equal(listed.status, 200); assert.equal((await parseMcpResponse(listed)).result.serverInfo.name, 'open-agents-sdlc-kanban');
    const discover = await mcpRequest(base, 'server/discover', {}, 8);
    assert.equal(discover.status, 200); assert.ok(discover.body.result.supportedVersions.includes('2026-07-28')); assert.equal(discover.body.result._meta['io.modelcontextprotocol/serverInfo'].name, 'open-agents-sdlc-kanban');
    const toolsResponse = await mcpRequest(base, 'tools/list', {}, 9);
    const tools = toolsResponse.body.result.tools; assert.ok(tools.some(tool => tool.name === 'kanban_move_card')); assert.ok(tools.some(tool => tool.name === 'kanban_run_card')); assert.ok(tools.some(tool => tool.name === 'kanban_update_board'));
    assert.ok(tools.find(tool => tool.name === 'kanban_create_board').inputSchema.properties.columns); assert.ok(tools.find(tool => tool.name === 'kanban_create_board').inputSchema.properties.lanes); assert.ok(tools.find(tool => tool.name === 'kanban_create_card').inputSchema.properties.dueDate);
    const call = await mcpRequest(base, 'tools/call', { name: 'kanban_get_board', arguments: { boardId: board.body.id } }, 10);
    const fetched = call.body.result.structuredContent || JSON.parse(call.body.result.content[0].text); assert.equal(fetched.cards[0].id, card.id); assert.equal(fetched.cards[0].columnId, 'doing'); assert.equal(fetched.cards[0].dueDate, '2026-12-20');
    const invalidOrigin = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://malicious.example' }, body: JSON.stringify({ jsonrpc: '2.0', id: 11, method: 'tools/list' }) });
    assert.equal(invalidOrigin.status, 403);
    const legacyInitialize = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 12, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'legacy-test', version: '1' } } }) });
    assert.equal(legacyInitialize.status, 200); assert.equal((await parseMcpResponse(legacyInitialize)).result.serverInfo.name, 'open-agents-sdlc-kanban');
    assert.equal((await request(`/api/workflows/${workflow.body.id}`, { method: 'DELETE' })).status, 409);
    const deletedCard = await mcpRequest(base, 'tools/call', { name: 'kanban_delete_card', arguments: { boardId: board.body.id, cardId: card.id } }, 13);
    assert.equal(deletedCard.status, 200); assert.equal((deletedCard.body.result.structuredContent || JSON.parse(deletedCard.body.result.content[0].text)).ok, true);
    assert.equal((await request(`/api/boards/${board.body.id}`, { method: 'DELETE' })).status, 200);
    assert.equal((await request(`/api/boards/${customBoardResult.id}`, { method: 'DELETE' })).status, 200);
    assert.equal((await request(`/api/workflows/${workflow.body.id}`, { method: 'DELETE' })).status, 200);
  });
});

test('supports multi-workflow boards, custom fields and labels, card colors, files, history, comments and relations', async () => {
  await withServer({}, async ({ request, root, base }) => {
    const workflows = (await request('/api/workflows')).body;
    const extraWorkflow = await request('/api/workflows', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Workflow secundário', templateId: 'blank' }) });
    const boardResponse = await request('/api/boards', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Entrega personalizável', workflowId: workflows.activeWorkflowId, workflowIds: [workflows.activeWorkflowId, extraWorkflow.body.id], columns: [{ id: 'todo', name: 'A fazer', color: '#345678' }, { id: 'done', name: 'Concluído', color: '#43b78d' }], lanes: [{ id: 'general', name: 'Geral', color: '#6482de' }], labels: [{ id: 'bug', name: 'Defeito', color: '#df687b' }, { id: 'feature', name: 'Funcionalidade', color: '#43b78d' }], customFields: [{ id: 'estimate', name: 'Estimativa', type: 'number', required: true }, { id: 'platform', name: 'Plataforma', type: 'select', options: ['Web', 'Mobile'] }] }) });
    assert.equal(boardResponse.status, 201);
    const board = boardResponse.body;
    assert.deepEqual(board.workflowIds, [workflows.activeWorkflowId, extraWorkflow.body.id]);
    assert.equal(board.columns[0].color, '#345678'); assert.equal(board.labels[0].name, 'Defeito'); assert.equal(board.customFields[1].options[1], 'Mobile');
    const related = await request(`/api/boards/${board.id}/cards`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Preparar ambiente', customFields: { estimate: 2, platform: 'Web' } }) });
    assert.equal(related.status, 201);
    const created = await request(`/api/boards/${board.id}/cards`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Corrigir fluxo', workflowId: extraWorkflow.body.id, columnId: 'todo', laneId: 'general', labels: ['bug'], color: '#f0c040', customFields: { estimate: 5, platform: 'Mobile' }, relatedCardIds: [related.body.id] }) });
    assert.equal(created.status, 201); assert.equal(created.body.workflowId, extraWorkflow.body.id); assert.equal(created.body.color, '#f0c040');
    assert.deepEqual(created.body.customFields, { estimate: 5, platform: 'Mobile' }); assert.ok(created.body.history.some(entry => entry.action === 'created'));
    assert.deepEqual(created.body.relatedCardIds, [related.body.id]);
    let refreshedBoard = (await request(`/api/boards/${board.id}`)).body;
    assert.deepEqual(refreshedBoard.cards.find(item => item.id === related.body.id).relatedCardIds, [created.body.id]);
    const comment = await request(`/api/boards/${board.id}/cards/${created.body.id}/comments`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: 'Validar no navegador.', author: 'QA' }) });
    assert.equal(comment.status, 201); assert.equal(comment.body.author, 'QA');
    const fileContents = Buffer.from('resultado de compilação').toString('base64');
    const attachment = await request(`/api/boards/${board.id}/cards/${created.body.id}/attachments`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename: 'build-log.txt', mimeType: 'text/plain', data: fileContents }) });
    assert.equal(attachment.status, 201); assert.equal(attachment.body.size, Buffer.byteLength('resultado de compilação'));
    const download = await fetch(base + attachment.body.url); assert.equal(download.status, 200); assert.match(download.headers.get('content-disposition'), /attachment/); assert.equal(await download.text(), 'resultado de compilação');
    const secondAttachment = await request(`/api/boards/${board.id}/cards/${created.body.id}/attachments`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename: 'cleanup.txt', mimeType: 'text/plain', data: Buffer.from('cleanup').toString('base64') }) });
    const invalidField = await request(`/api/boards/${board.id}/cards`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Sem estimativa', customFields: { platform: 'Web' } }) });
    assert.equal(invalidField.status, 400);
    const run = await request(`/api/boards/${board.id}/cards/${created.body.id}/run`, { method: 'POST' });
    assert.equal(run.status, 202); assert.equal(run.body.workflowId, extraWorkflow.body.id);
    let runResult; const runDeadline = Date.now() + 3000;
    do { await new Promise(resolve => setTimeout(resolve, 10)); runResult = (await request(`/api/runs/${run.body.id}`)).body; } while (!['completed', 'failed'].includes(runResult.status) && Date.now() < runDeadline);
    assert.equal(runResult.status, 'completed', runResult.error || JSON.stringify(runResult.log));
    refreshedBoard = (await request(`/api/boards/${board.id}`)).body;
    const persisted = refreshedBoard.cards.find(item => item.id === created.body.id);
    assert.ok(persisted.history.some(entry => entry.action === 'comment')); assert.ok(persisted.history.filter(entry => entry.action === 'attachment').length >= 2);
    assert.equal(persisted.comments[0].body, 'Validar no navegador.');
    assert.equal((await request(`/api/workflows/${extraWorkflow.body.id}`, { method: 'DELETE' })).status, 409);
    const unlinked = await request(`/api/boards/${board.id}/cards/${created.body.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ relatedCardIds: [] }) });
    assert.deepEqual(unlinked.body.relatedCardIds, []);
    refreshedBoard = (await request(`/api/boards/${board.id}`)).body;
    assert.deepEqual(refreshedBoard.cards.find(item => item.id === related.body.id).relatedCardIds, []);
    assert.equal((await request(`/api/boards/${board.id}`, { method: 'DELETE' })).body.ok, true);
    await assert.rejects(fs.stat(path.join(root, 'data', 'board-attachments', secondAttachment.body.id)), { code: 'ENOENT' });
    assert.equal((await request(`/api/workflows/${extraWorkflow.body.id}`, { method: 'DELETE' })).status, 200);
  });
});

test('creates, activates, updates and deletes independent workflows and reusable agents', async () => {
  await withServer({}, async ({ request }) => {
    const initial = await request('/api/workflows'); assert.equal(initial.status, 200); assert.equal(initial.body.workflows.length, 1);
    const first = await request('/api/workflows', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'API de faturamento' }) });
    const second = await request('/api/workflows', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'API de catálogo' }) });
    assert.equal(first.status, 201); assert.equal(second.status, 201); assert.notEqual(first.body.id, second.body.id);
    assert.equal((await request('/api/workflows')).body.workflows.length, 3);
    assert.equal((await request(`/api/workflows/${first.body.id}/activate`, { method: 'POST' })).body.id, first.body.id);
    const custom = await request(`/api/workflows/${first.body.id}`); custom.body.name = 'Faturamento v2';
    assert.equal((await request(`/api/workflows/${first.body.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(custom.body) })).body.name, 'Faturamento v2');
    assert.equal((await request('/api/workflow')).body.name, 'Faturamento v2');
    assert.equal((await request(`/api/workflows/${second.body.id}`)).body.name, 'API de catálogo');

    const createdAgent = await request('/api/agents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Especialista C#', runner: 'codex', model: 'gpt-6-luna', effort: 'high', prompt: 'Crie e valide programas em C#.' }) });
    assert.equal(createdAgent.status, 201);
    const agent = createdAgent.body;
    const workflow = (await request(`/api/workflows/${first.body.id}`)).body;
    const planner = workflow.nodes.find(node => node.id === 'planner'); planner.config = { ...planner.config, agentId: agent.id, prompt: agent.prompt };
    await request(`/api/workflows/${first.body.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(workflow) });
    assert.equal((await request('/api/agents')).body.find(item => item.id === agent.id).name, 'Especialista C#');
    assert.equal((await request(`/api/workflows/${first.body.id}`)).body.nodes.find(node => node.id === 'planner').config.agentId, agent.id);
    assert.equal((await request(`/api/agents/${agent.id}`, { method: 'DELETE' })).status, 200);
    assert.equal((await request(`/api/agents/${agent.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(agent) })).status, 404);
    const deleted = await request(`/api/workflows/${first.body.id}`, { method: 'DELETE' }); assert.equal(deleted.status, 200); assert.equal(deleted.body.activeWorkflowId, initial.body.activeWorkflowId);
    assert.equal((await request('/api/workflow')).body.name, 'Feature delivery pipeline');
  });
});

test('lists ready workflow templates and creates the selected graph', async () => {
  await withServer({}, async ({ request }) => {
    const templates = await request('/api/workflow-templates');
    assert.equal(templates.status, 200);
    assert.deepEqual(templates.body.map(item => item.id), ['sdlc-standard', 'blank', 'code-review']);
    assert.equal(templates.body.find(item => item.id === 'sdlc-standard').isDefault, true);

    const blank = await request('/api/workflows', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Meu workflow vazio', templateId: 'blank' }) });
    assert.equal(blank.status, 201); assert.equal(blank.body.nodes.length, 1); assert.equal(blank.body.nodes[0].type, 'trigger'); assert.deepEqual(blank.body.edges, []);
    const review = await request('/api/workflows', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Revisão automatizada', templateId: 'code-review' }) });
    assert.equal(review.status, 201); assert.deepEqual(review.body.edges, [['trigger', 'review'], ['review', 'approval']]);
    assert.equal(review.body.nodes.find(node => node.id === 'review').config.model, 'gpt-6-luna');
    const invalid = await request('/api/workflows', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Template desconhecido', templateId: 'unknown' }) });
    assert.equal(invalid.status, 400);
  });
});

test('validates stressed agent, workflow, settings and dataset forms', async () => {
  await withServer({}, async ({ request }) => {
    const manyWorkflows = await Promise.all(Array.from({ length: 18 }, (_, index) => request('/api/workflows', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `Stress workflow ${index}` }) })));
    assert.ok(manyWorkflows.every(result => result.status === 201));
    assert.equal((await request('/api/workflows')).body.workflows.length, 19);
    assert.equal((await request('/api/workflows', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Stress workflow 0' }) })).status, 409);
    assert.equal((await request('/api/workflows', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'x'.repeat(121) }) })).status, 400);

    const duplicateAgentBody = { name: 'Agente simultâneo', runner: 'codex', model: 'gpt-6-luna', effort: 'high', prompt: 'P'.repeat(15_000) };
    const duplicateAttempts = await Promise.all(Array.from({ length: 12 }, () => request('/api/agents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(duplicateAgentBody) })));
    assert.equal(duplicateAttempts.filter(result => result.status === 201).length, 1);
    assert.equal(duplicateAttempts.filter(result => result.status === 409).length, 11);
    assert.equal((await request('/api/agents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...duplicateAgentBody, name: 'Prompt grande', prompt: 'P'.repeat(15_001) }) })).status, 400);
    assert.equal((await request('/api/agents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...duplicateAgentBody, name: 'Excesso de datasets', prompt: 'Contexto válido', datasetIds: Array.from({ length: 101 }, (_, index) => `dataset-${index}`) }) })).status, 400);

    assert.equal((await request('/api/settings')).body.maxConcurrentRuns, 3);
    const invalidSettings = await request('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agentTimeoutMinutes: 121 }) });
    assert.equal(invalidSettings.status, 400);
    const settings = await request('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ maxConcurrentRuns: 2, defaultRunner: 'opencode', defaultModel: 'modelo-de-teste', defaultEffort: 'medium' }) });
    assert.equal(settings.body.maxConcurrentRuns, 2);
    const configuredWorkflow = await request('/api/workflows', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Workflow com padrões definidos' }) });
    const collectAgents = nodes => nodes.flatMap(node => [...(node.type === 'agent' ? [node] : []), ...(node.type === 'subworkflow' ? collectAgents(node.children || []) : [])]);
    const configuredAgents = collectAgents(configuredWorkflow.body.nodes);
    assert.equal(configuredAgents.length, 5);
    assert.ok(configuredAgents.every(node => node.config.runner === 'opencode' && node.config.model === 'modelo-de-teste' && node.config.effort === 'medium'));

    assert.equal((await request('/api/datasets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Grande demais', content: 'D'.repeat(600_001) }) })).status, 400);
    const boundary = await request('/api/datasets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Limite válido', content: 'D'.repeat(600_000) }) });
    assert.equal(boundary.status, 201); assert.equal(boundary.body.chars, 600_000);
  });
});

test('validates editable node forms and protects datasets linked to agents and workflows', async () => {
  const makeWorkflow = (type, config) => ({ id: 'node-form-test', name: 'Node form test', nodes: [{ id: 'trigger', type: 'trigger', name: 'Entrada' }, { id: 'configured', type, name: 'Etapa configurável', config }], edges: [['trigger', 'configured']] });
  assert.throws(() => validateWorkflow(makeWorkflow('agent', { prompt: 'p'.repeat(15_001) })), /Configuração inválida/);
  assert.throws(() => validateWorkflow(makeWorkflow('approval', { message: 'a'.repeat(1001) })), /1\.000 caracteres/);
  assert.throws(() => validateWorkflow(makeWorkflow('condition', { contains: 'c'.repeat(501) })), /500 caracteres/);
  assert.throws(() => validateWorkflow(makeWorkflow('integration', { command: 'x'.repeat(4001) })), /4\.000 caracteres/);

  await withServer({}, async ({ request, base }) => {
    const dataset = await request('/api/datasets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Contexto de qualidade', content: 'Critérios de validação do projeto.' }) });
    const invalidWorkflow = (await request('/api/workflow')).body;
    invalidWorkflow.nodes.find(node => node.id === 'planner').config.datasetIds = ['dataset-inexistente'];
    assert.equal((await request('/api/workflow', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(invalidWorkflow) })).status, 400);
    const missingDatasetAgent = await request('/api/agents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Agente sem dataset', runner: 'codex', model: 'gpt-6-luna', effort: 'high', prompt: 'Valide a tarefa.', datasetIds: ['dataset-inexistente'] }) });
    assert.equal(missingDatasetAgent.status, 400);
    const agentData = { name: 'Agente com contexto', runner: 'codex', model: 'gpt-6-luna', effort: 'high', prompt: 'Valide a tarefa.', datasetIds: [dataset.body.id] };
    const agent = await request('/api/agents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(agentData) });
    agentData.prompt = 'Valide a tarefa sem perder seu contexto.';
    assert.equal((await request(`/api/agents/${agent.body.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(agentData) })).body.datasetIds[0], dataset.body.id);
    const workflow = (await request('/api/workflow')).body;
    workflow.nodes.find(node => node.id === 'planner').config.datasetIds = [dataset.body.id];
    assert.equal((await request('/api/workflow', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(workflow) })).body.nodes.find(node => node.id === 'planner').config.datasetIds[0], dataset.body.id);
    const deleteWhileLinked = await fetch(`${base}/api/datasets/${dataset.body.id}`, { method: 'DELETE' });
    assert.equal(deleteWhileLinked.status, 409);
    assert.equal((await request(`/api/agents/${agent.body.id}`, { method: 'DELETE' })).status, 200);
    const stillUsedInWorkflow = await fetch(`${base}/api/datasets/${dataset.body.id}`, { method: 'DELETE' });
    assert.equal(stillUsedInWorkflow.status, 409);
    workflow.nodes.find(node => node.id === 'planner').config.datasetIds = [];
    assert.equal((await request('/api/workflow', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(workflow) })).status, 200);
    assert.equal((await request(`/api/datasets/${dataset.body.id}`, { method: 'DELETE' })).status, 200);
  });
});

test('saves per-workflow execution target and validates framework selections', async () => {
  const workflow = structuredClone(defaultWorkflow);
  workflow.execution = { target: 'kubernetes', frameworks: ['dotnet10', 'nodejs'] };
  assert.deepEqual(validateWorkflow(workflow).execution, { target: 'kubernetes', frameworks: ['dotnet10', 'nodejs'] });
  assert.throws(() => validateWorkflow({ ...structuredClone(defaultWorkflow), execution: { target: 'bare-metal', frameworks: [] } }), /Ambiente de execução inválido/);
  assert.throws(() => validateWorkflow({ ...structuredClone(defaultWorkflow), execution: { target: 'container', frameworks: ['unknown'] } }), /frameworks inválida/);
  await withServer({}, async ({ request }) => {
    const settings = await request('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ defaultExecutionTarget: 'kubernetes', kubernetesNamespace: 'dev-team', kubernetesImage: 'open-agents-sdlc:runtime', kubernetesWorkspacePvc: 'workspace-project', kubernetesKubeconfigPath: '/run/kube/config' }) });
    assert.equal(settings.body.defaultExecutionTarget, 'kubernetes');
    const created = await request('/api/workflows', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Novo workflow Kubernetes' }) });
    assert.equal(created.body.execution.target, 'kubernetes');
    created.body.execution = { target: 'container', frameworks: ['python', 'cpp'] };
    const saved = await request(`/api/workflows/${created.body.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(created.body) });
    assert.deepEqual(saved.body.execution, { target: 'container', frameworks: ['python', 'cpp'] });
  });
});

test('saves reusable Skills, injects their instructions and prevents deleting linked Skills', async () => {
  const receivedPrompts = [];
  await withServer({
    cliProbe: async () => [{ id: 'codex', installed: true, version: 'test' }],
    commandExecutor: async (_command, _args, options) => { receivedPrompts.push(options.input); options.onOutput?.('stdout', '{"type":"item.completed","item":{"type":"agent_message","text":"skill-applied"}}\n'); return { output: 'skill-applied' }; }
  }, async ({ request, base }) => {
    const skill = await request('/api/skills', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Revisão segura', description: 'Revisão de mudanças', instructions: 'Sempre procure por exposição de segredos e valide entradas externas.' }) });
    assert.equal(skill.status, 201);
    const agent = await request('/api/agents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Revisor com Skill', runner: 'codex', model: 'gpt-6-luna', effort: 'high', prompt: 'Revise o código com cuidado.', skillIds: [skill.body.id] }) });
    assert.equal(agent.status, 201);
    const workflow = (await request('/api/workflow')).body;
    workflow.nodes = [{ id: 'trigger', type: 'trigger', name: 'Entrada', config: {} }, { id: 'reviewer', type: 'agent', name: 'Revisão', config: { runner: 'codex', model: 'gpt-6-luna', effort: 'high', prompt: agent.body.prompt, skillIds: agent.body.skillIds } }];
    workflow.edges = [['trigger', 'reviewer']];
    assert.equal((await request('/api/workflow', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(workflow) })).status, 200);
    const run = await request('/api/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: 'Revise a mudança' }) });
    assert.equal(run.status, 202);
    let result; const deadline = Date.now() + 3000;
    do { await new Promise(resolve => setTimeout(resolve, 20)); result = (await request(`/api/runs/${run.body.id}`)).body; } while (!['completed', 'failed'].includes(result.status) && Date.now() < deadline);
    assert.equal(result.status, 'completed', result.error || 'A Skill não foi aplicada na execução.');
    assert.match(receivedPrompts[0], /Sempre procure por exposição de segredos/);
    assert.ok(result.log.some(entry => entry.message.includes('skill-applied')));
    assert.equal((await fetch(`${base}/api/skills/${skill.body.id}`, { method: 'DELETE' })).status, 409);
    assert.equal((await request(`/api/agents/${agent.body.id}`, { method: 'DELETE' })).status, 200);
    workflow.nodes[1].config.skillIds = [];
    assert.equal((await request('/api/workflow', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(workflow) })).status, 200);
    assert.equal((await request(`/api/skills/${skill.body.id}`, { method: 'DELETE' })).status, 200);
  });
});

test('runs an integration through a Kubernetes Job, streams output and cleans up', async () => {
  const kubectlCalls = []; let jobManifest;
  const kubernetesExecutor = async (_command, args, options) => {
    kubectlCalls.push(args);
    if (args.includes('pvc')) return { output: JSON.stringify({ status: { phase: 'Bound' } }), exitCode: 0 };
    if (args.includes('can-i')) return { output: 'yes', exitCode: 0 };
    if (args[0] === 'apply' && args.includes('-f')) { jobManifest = JSON.parse(options.input); return { output: 'job created', exitCode: 0 }; }
    if (args[0] === 'get' && args.includes('pods')) return { output: JSON.stringify({ items: [{ metadata: { name: 'openagents-test-pod' }, status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] } }] }), exitCode: 0 };
    if (args[0] === 'exec') {
      const workerRequest = JSON.parse(options.input);
      if (workerRequest.command === 'node' && workerRequest.args[0] === '--version') { options.onOutput?.('stdout', 'v22.0.0\n'); return { output: 'v22.0.0', exitCode: 0 }; }
      assert.equal(workerRequest.command, 'sh'); assert.deepEqual(workerRequest.args, ['-lc', 'printf kubernetes-worker-ok']); options.onOutput?.('stdout', 'kubernetes-worker-ok\n'); return { output: 'kubernetes-worker-ok', exitCode: 0 };
    }
    if (args[0] === 'delete') return { output: 'deleted', exitCode: 0 };
    throw new Error(`kubectl inesperado: ${args.join(' ')}`);
  };
  await withServer({ kubernetesExecutor }, async ({ request }) => {
    const settings = await request('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kubernetesNamespace: 'dev-team', kubernetesImage: 'open-agents-sdlc:runtime', kubernetesWorkspacePvc: 'workspace-project', kubernetesKubeconfigPath: '/tmp/kubeconfig' }) });
    assert.equal(settings.status, 200);
    const workflow = structuredClone(defaultWorkflow);
    workflow.execution = { target: 'kubernetes', frameworks: ['nodejs'] };
    workflow.nodes = [{ id: 'trigger', type: 'trigger', name: 'Entrada', config: {} }, { id: 'integration', type: 'integration', name: 'Executar no worker', config: { command: 'printf kubernetes-worker-ok', requiresApproval: false } }];
    workflow.edges = [['trigger', 'integration']];
    await request('/api/workflow', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(workflow) });
    const created = await request('/api/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: 'Validar worker Kubernetes' }) });
    let result; const deadline = Date.now() + 4000;
    do { await new Promise(resolve => setTimeout(resolve, 25)); result = (await request(`/api/runs/${created.body.id}`)).body; } while (!['completed', 'failed'].includes(result.status) && Date.now() < deadline);
    assert.equal(result.status, 'completed', result.error || JSON.stringify(result.log));
    assert.equal(result.execution.target, 'kubernetes');
    assert.equal(jobManifest.spec.template.spec.containers[0].image, 'open-agents-sdlc:runtime');
    assert.equal(jobManifest.spec.template.spec.volumes[0].persistentVolumeClaim.claimName, 'workspace-project');
    assert.equal(jobManifest.spec.template.spec.containers[0].env.find(item => item.name === 'OPEN_AGENTS_FRAMEWORKS').value, 'nodejs');
    assert.ok(kubectlCalls.some(args => args[0] === 'delete' && args[1] === 'job'));
    assert.ok(result.log.some(entry => entry.message.includes('kubernetes-worker-ok')));
    assert.ok(result.log.some(entry => entry.message.includes('Node.js 22 disponível no worker')));
  });
});

test('stops before creating a Kubernetes Job when the workspace PVC is not bound', async () => {
  const kubernetesExecutor = async (_command, args) => {
    assert.ok(args.includes('pvc'));
    return { output: JSON.stringify({ status: { phase: 'Pending' } }), exitCode: 0 };
  };
  await withServer({ kubernetesExecutor }, async ({ request }) => {
    await request('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kubernetesImage: 'open-agents-sdlc:runtime', kubernetesWorkspacePvc: 'workspace-project', kubernetesKubeconfigPath: '/tmp/kubeconfig' }) });
    const workflow = structuredClone(defaultWorkflow);
    workflow.execution = { target: 'kubernetes', frameworks: [] };
    workflow.nodes = [{ id: 'trigger', type: 'trigger', name: 'Entrada', config: {} }]; workflow.edges = [];
    await request('/api/workflow', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(workflow) });
    const created = await request('/api/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: 'PVC pendente' }) });
    let result; const deadline = Date.now() + 3000;
    do { await new Promise(resolve => setTimeout(resolve, 20)); result = (await request(`/api/runs/${created.body.id}`)).body; } while (!['completed', 'failed'].includes(result.status) && Date.now() < deadline);
    assert.equal(result.status, 'failed');
    assert.match(result.error, /ainda não está vinculado/);
    assert.equal(result.steps.length, 0);
  });
});

test('encrypts credentials and returns metadata only', async () => {
  await withServer({}, async ({ request, root }) => {
    const saved = await request('/api/credentials', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider: 'openai', label: 'test key', token: 'sk-test-secret-value' }) });
    assert.equal(saved.status, 201); assert.equal('token' in saved.body, false);
    assert.equal((await request('/api/credentials')).body[0].label, 'test key');
    const raw = await fs.readFile(path.join(root, 'data', 'credentials.json'), 'utf8');
    assert.equal(raw.includes('sk-test-secret-value'), false);
  });
});

test('reports a mounted Codex OAuth session without exposing it', async () => {
  await withServer({ cliProbe: async () => [{ id: 'codex', installed: true, version: 'test', oauthAvailable: true }] }, async ({ request }) => {
    const status = await request('/api/runners'); const codex = status.body.runners.find(item => item.id === 'codex');
    assert.equal(codex.authenticated, true); assert.equal(codex.oauthAvailable, true); assert.equal('token' in codex, false);
  });
});

test('runs workflow steps, streams runner output and waits for human approval', async () => {
  const calls = [];
  await withServer({ cliProbe: async () => [{ id: 'codex', installed: true, version: 'test' }], commandExecutor: async (command, args, options) => { calls.push({ command, args }); options?.onOutput?.('stdout', 'agent result\n'); options?.onOutput?.('stderr', 'runner diagnostic\n'); return { output: 'agent result' }; } }, async ({ request, base }) => {
    const workflow = structuredClone(defaultWorkflow);
    workflow.nodes = workflow.nodes.filter(node => ['trigger', 'planner', 'approval', 'deploy'].includes(node.id));
    workflow.edges = [['trigger', 'planner'], ['planner', 'approval'], ['approval', 'deploy']];
    workflow.nodes.find(node => node.id === 'deploy').config.command = 'echo deployed';
    await request('/api/workflow', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(workflow) });
    const created = await request('/api/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: 'Build a feature' }) });
    assert.equal(created.status, 202);
    let run; const deadline = Date.now() + 3000;
    do { await new Promise(resolve => setTimeout(resolve, 20)); run = (await request(`/api/runs/${created.body.id}`)).body; } while (run.status !== 'waiting_approval' && Date.now() < deadline);
    assert.equal(run.status, 'waiting_approval'); assert.equal(calls.length, 1); assert.match(calls[0].args.join(' '), /gpt-6-luna/); assert.ok(calls[0].args.includes('--dangerously-bypass-approvals-and-sandbox')); assert.match(calls[0].args.join(' '), /model_reasoning_effort="high"/);
    assert.equal((await request(`/api/runs/${run.id}/approve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'approve' }) })).status, 200);
    const completeBy = Date.now() + 3000;
    do { await new Promise(resolve => setTimeout(resolve, 20)); run = (await request(`/api/runs/${run.id}`)).body; } while (run.status !== 'completed' && run.status !== 'failed' && Date.now() < completeBy);
    assert.equal(run.status, 'completed'); assert.ok(run.steps.some(step => step.type === 'integration' && step.status === 'completed'));
    assert.ok(run.log.some(entry => entry.message.includes('agent result'))); assert.ok(run.log.some(entry => entry.message.includes('runner diagnostic')));
    const stream = await fetch(`${base}/api/runs/${run.id}/events`); assert.match(stream.headers.get('content-type'), /text\/event-stream/);
    const reader = stream.body.getReader(); const decoder = new TextDecoder(); let packets = '';
    for (let index = 0; index < 4 && !packets.includes('event: snapshot'); index++) { const chunk = await reader.read(); if (chunk.done) break; packets += decoder.decode(chunk.value, { stream: true }); }
    assert.match(packets, /event: snapshot/); assert.match(packets, /agent result/); await reader.cancel();
  });
});

test('exposes live nested workflow paths so the editor can restore and highlight the active step', async () => {
  let markCommandStarted;
  const commandStarted = new Promise(resolve => { markCommandStarted = resolve; });
  await withServer({ commandExecutor: async () => { markCommandStarted(); await new Promise(resolve => setTimeout(resolve, 350)); return { output: 'nested-ok', exitCode: 0 }; } }, async ({ request }) => {
    const workflow = structuredClone(defaultWorkflow);
    workflow.name = 'Pipeline com sub-workflow';
    workflow.nodes = [
      { id: 'trigger', type: 'trigger', name: 'Entrada', config: {} },
      { id: 'build', type: 'subworkflow', name: 'Construir', config: {}, children: [
        { id: 'trigger', type: 'trigger', name: 'Início interno', config: {} },
        { id: 'deploy', type: 'integration', name: 'Executar validação', config: { command: 'printf nested' } }
      ], childEdges: [['trigger', 'deploy']] }
    ];
    workflow.edges = [['trigger', 'build']];
    assert.equal((await request('/api/workflow', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(workflow) })).status, 200);
    const created = await request('/api/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: 'Validar navegação e etapa ativa' }) });
    assert.equal(created.status, 202);
    await Promise.race([commandStarted, new Promise((_, reject) => setTimeout(() => reject(new Error('A integração não iniciou a tempo.')), 2000))]);
    let run = (await request(`/api/runs/${created.body.id}`)).body;
    assert.equal(run.runtimeActive, true);
    assert.ok(run.steps.some(step => step.nodeId === 'build' && step.status === 'running' && step.graphPath.length === 0));
    assert.ok(run.steps.some(step => step.nodeId === 'deploy' && step.status === 'running' && JSON.stringify(step.graphPath) === JSON.stringify(['build'])));
    assert.equal((await request('/api/runs')).body.find(item => item.id === run.id).runtimeActive, true);
    const deadline = Date.now() + 3000;
    do { await new Promise(resolve => setTimeout(resolve, 20)); run = (await request(`/api/runs/${run.id}`)).body; } while (!['completed', 'failed', 'cancelled'].includes(run.status) && Date.now() < deadline);
    assert.equal(run.status, 'completed', run.error || JSON.stringify(run.log));
    assert.equal(run.runtimeActive, false);
  });
});

test('marks persisted in-flight runs as interrupted after a runtime restart', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'open-agents-sdlc-restart-'));
  const dataDir = path.join(root, 'data'); await fs.mkdir(dataDir, { recursive: true });
  const run = { id: 'interrupted-run', workflowId: 'workflow-test', workflowName: 'Workflow de teste', status: 'running', createdAt: new Date().toISOString(), steps: [{ nodeId: 'agent', name: 'Agente', type: 'agent', graphPath: [], status: 'running' }], log: [] };
  await fs.writeFile(path.join(dataDir, 'runs.json'), JSON.stringify([run]));
  const server = createAppServer({ dataDir, workspaceDir: root, logger: { log() {}, warn() {}, error() {} } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${base}/api/runs`); const [recovered] = await response.json();
    assert.equal(recovered.status, 'failed'); assert.equal(recovered.runtimeActive, false); assert.equal(recovered.interrupted, true);
    assert.equal(recovered.steps[0].status, 'failed');
    assert.match(recovered.log.at(-1).message, /runtime reiniciou/i);
    assert.equal((await (await fetch(`${base}/api/runs/interrupted-run`)).json()).status, 'failed');
  } finally {
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections?.(); });
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test('bounds parallel runs and keeps all concurrent run records', async () => {
  let active = 0; let peak = 0;
  await withServer({ commandExecutor: async () => { active++; peak = Math.max(peak, active); await new Promise(resolve => setTimeout(resolve, 25)); active--; return { output: 'queue-ok', exitCode: 0 }; } }, async ({ request }) => {
    await request('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ maxConcurrentRuns: 1 }) });
    const workflow = structuredClone(defaultWorkflow);
    workflow.nodes = [{ id: 'trigger', type: 'trigger', name: 'Entrada', config: {} }, { id: 'deploy', type: 'integration', name: 'Verificar fila', config: { command: 'echo queue-ok', requiresApproval: false } }];
    workflow.edges = [['trigger', 'deploy']];
    await request('/api/workflow', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(workflow) });
    const created = await Promise.all(Array.from({ length: 8 }, (_, index) => request('/api/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: `Execução ${index}` }) })));
    assert.ok(created.every(result => result.status === 202));
    for (const item of created) {
      const deadline = Date.now() + 5000; let run;
      do { await new Promise(resolve => setTimeout(resolve, 15)); run = (await request(`/api/runs/${item.body.id}`)).body; } while (!['completed', 'failed', 'cancelled'].includes(run.status) && Date.now() < deadline);
      assert.equal(run.status, 'completed', run.error || JSON.stringify(run.log));
    }
    assert.equal(peak, 1);
    assert.equal((await request('/api/runs')).body.filter(item => created.some(createdRun => createdRun.body.id === item.id)).length, 8);
  });
});

test('rejects disconnected paths and oversized dataset payloads', async () => {
  await withServer({}, async ({ request }) => {
    const workflow = structuredClone(defaultWorkflow); workflow.edges.push(['deploy', 'trigger']);
    assert.equal((await request('/api/workflow', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(workflow) })).status, 400);
    assert.equal((await request('/api/datasets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'empty', content: '' }) })).status, 400);
  });
});
