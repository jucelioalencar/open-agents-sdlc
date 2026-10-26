import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { localhostHostValidation, localhostOriginValidation, toNodeHandler } from '@modelcontextprotocol/node';
import * as z from 'zod/v4';

const execFileAsync = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, '..');
const MAX_BODY = 2 * 1024 * 1024;
const MAX_BOARD_ATTACHMENT_BYTES = 1024 * 1024;
const MAX_DATASET_CHARS = 600_000;
const MAX_SKILL_INSTRUCTIONS = 30_000;
const ID = /^[a-zA-Z0-9_-]{1,80}$/;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
export const runtimeFrameworks = [
  { id: 'dotnet9', name: '.NET SDK 9', description: 'Compila projetos .NET 9.' },
  { id: 'dotnet10', name: '.NET SDK 10', description: 'Compila projetos .NET 10.' },
  { id: 'nodejs', name: 'Node.js 22', description: 'Node.js e npm.' },
  { id: 'python', name: 'Python 3', description: 'Python, pip e ambientes virtuais.' },
  { id: 'rust', name: 'Rust stable', description: 'rustc e Cargo.' },
  { id: 'php', name: 'PHP CLI', description: 'PHP para aplicações e scripts.' },
  { id: 'perl', name: 'Perl', description: 'Perl para scripts e automações.' },
  { id: 'cpp', name: 'C/C++', description: 'GCC, G++, make e ferramentas de compilação.' },
  { id: 'go', name: 'Go', description: 'Go compiler e ferramentas padrão.' },
  { id: 'java', name: 'Java JDK', description: 'JDK e ferramentas Java.' },
  { id: 'ruby', name: 'Ruby', description: 'Ruby e RubyGems.' }
];
const runtimeFrameworkIds = new Set(runtimeFrameworks.map(item => item.id));
const defaultWorkflow = {
  id: 'feature-delivery',
  name: 'Feature delivery pipeline',
  nodes: [
    { id: 'trigger', type: 'trigger', name: 'Nova solicitação', position: { x: 7, y: 22 }, config: {} },
    { id: 'planner', type: 'agent', name: 'Refinar & planejar', position: { x: 32, y: 22 }, config: { runner: 'codex', model: 'gpt-6-luna', effort: 'high', harness: 'codex', prompt: 'Analise a solicitação, identifique requisitos, critérios de aceite e riscos. Produza um plano conciso antes de implementar.', datasetIds: [], credentialId: null } },
    { id: 'build', type: 'subworkflow', name: 'Implementar feature', position: { x: 60, y: 22 }, config: {}, children: [
      { id: 'analyze', type: 'agent', name: 'Analisar código', config: { runner: 'codex', model: 'gpt-6-luna', effort: 'high', harness: 'codex', prompt: 'Analise a base de código e o plano recebido. Identifique os arquivos que precisam mudar e riscos de integração. Não altere arquivos nesta etapa.', datasetIds: [], credentialId: null } },
      { id: 'implement', type: 'agent', name: 'Implementar alteração', config: { runner: 'codex', model: 'gpt-6-luna', effort: 'high', harness: 'codex', prompt: 'Implemente a solicitação e o plano no workspace. Preserve o estilo do projeto e faça alterações reais nos arquivos.', datasetIds: [], credentialId: null } },
      { id: 'validate', type: 'agent', name: 'Testes & validação', config: { runner: 'codex', model: 'gpt-6-luna', effort: 'high', harness: 'codex', prompt: 'Inspecione as alterações, execute os testes apropriados do projeto e corrija problemas encontrados. Relate os comandos e resultados.', datasetIds: [], credentialId: null } }
    ], childEdges: [['analyze', 'implement'], ['implement', 'validate']] },
    { id: 'qa', type: 'agent', name: 'QA & revisão', position: { x: 60, y: 52 }, config: { runner: 'codex', model: 'gpt-6-luna', effort: 'high', harness: 'codex', prompt: 'Faça uma revisão independente das alterações. Procure defeitos, riscos e critérios de aceite não atendidos. Corrija apenas problemas seguros e reporte evidências.', datasetIds: [], credentialId: null } },
    { id: 'approval', type: 'approval', name: 'Revisar pull request', position: { x: 32, y: 52 }, config: { message: 'Revise o resultado antes de executar a integração seguinte.' } },
    { id: 'deploy', type: 'integration', name: 'Publicar em staging', position: { x: 7, y: 52 }, config: { command: 'git status --short', label: 'Comando de integração', requiresApproval: true } }
  ],
  edges: [['trigger', 'planner'], ['planner', 'build'], ['build', 'qa'], ['qa', 'approval'], ['approval', 'deploy']],
  execution: { target: 'container', frameworks: [] }
};
const workflowTemplates = [
  { id: 'sdlc-standard', name: 'SDLC padrão', description: 'Pipeline completo com planejamento, implementação, QA, aprovação e publicação.', build: () => structuredClone(defaultWorkflow) },
  {
    id: 'blank', name: 'Começar do zero', description: 'Canvas limpo com uma entrada pronta para receber suas etapas.',
    build: () => ({ id: 'blank', name: 'Workflow em branco', nodes: [{ id: 'trigger', type: 'trigger', name: 'Nova solicitação', position: { x: 10, y: 40 }, config: {} }], edges: [], execution: { target: 'container', frameworks: [] } })
  },
  {
    id: 'code-review', name: 'Revisão de código', description: 'Analise mudanças com um agente e aguarde aprovação humana.',
    build: () => ({
      id: 'code-review', name: 'Revisão de código',
      nodes: [
        { id: 'trigger', type: 'trigger', name: 'Nova solicitação', position: { x: 10, y: 40 }, config: {} },
        { id: 'review', type: 'agent', name: 'Revisar alterações', position: { x: 40, y: 40 }, config: { runner: 'codex', model: 'gpt-6-luna', effort: 'high', harness: 'codex', prompt: 'Revise as alterações no workspace. Procure defeitos, riscos de segurança e critérios de aceite não atendidos. Registre os achados com evidências.', datasetIds: [], credentialId: null } },
        { id: 'approval', type: 'approval', name: 'Aprovar revisão', position: { x: 70, y: 40 }, config: { message: 'Revise os achados do agente e aprove para concluir.' } }
      ],
      edges: [['trigger', 'review'], ['review', 'approval']], execution: { target: 'container', frameworks: [] }
    })
  }
];
const DEFAULT_KANBAN_SKILL_ID = 'kanban-mcp-guide';
const DEFAULT_KANBAN_SKILL = {
  id: DEFAULT_KANBAN_SKILL_ID,
  name: 'Kanban MCP · Guia do agente',
  description: 'Ensina a consultar e operar quadros e cartões pelo servidor MCP do Open Agents SDLC.',
  isDefault: true,
  instructions: `# Usar o Kanban pelo MCP do Open Agents SDLC

## Quando usar
Use o quadro quando a solicitação pedir para consultar ou atualizar trabalho já organizado no Kanban. Antes de alterar algo, descubra o quadro e leia seus cartões, workflows, colunas, faixas, etiquetas e campos. Não crie, apague, mova ou execute cartões sem a solicitação do usuário.

## Acesso ao MCP
No runner Docker local, o servidor MCP fica em http://127.0.0.1:8080/mcp. Prefira ferramentas MCP já conectadas. Se não houver cliente MCP, chame esse endereço por HTTP com JSON-RPC. Para descobrir a interface, use server/discover e depois tools/list. Nas chamadas MCP, use Accept: application/json, text/event-stream; Content-Type: application/json; Mcp-Protocol-Version: 2026-07-28; Mcp-Method com o método JSON-RPC; e, em tools/call, Mcp-Name com o nome da ferramenta. Inclua params._meta com io.modelcontextprotocol/protocolVersion igual a 2026-07-28, io.modelcontextprotocol/clientInfo e io.modelcontextprotocol/clientCapabilities.

Exemplo para listar quadros por HTTP:

\`\`\`sh
curl -sS http://127.0.0.1:8080/mcp \\
  -H 'Accept: application/json, text/event-stream' \\
  -H 'Content-Type: application/json' \\
  -H 'Mcp-Protocol-Version: 2026-07-28' \\
  -H 'Mcp-Method: tools/call' \\
  -H 'Mcp-Name: kanban_list_boards' \\
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"kanban_list_boards","arguments":{},"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"kanban-agent","version":"1.0.0"},"io.modelcontextprotocol/clientCapabilities":{}}}}'
\`\`\`

Em execuções Kubernetes, 127.0.0.1 aponta para o próprio worker. Use somente um endereço MCP que tenha sido configurado como acessível pelo cluster; nunca suponha que o endereço Docker local funciona dentro do pod.

## Ferramentas disponíveis
- kanban_list_boards: lista os quadros e seu conteúdo.
- kanban_get_board: lê os dados completos de um quadro usando boardId.
- kanban_create_board e kanban_update_board: criam ou configuram quadro, workflows, colunas, faixas, etiquetas e campos.
- kanban_create_card, kanban_update_card e kanban_move_card: criam, alteram ou movem cartões. Use IDs existentes de coluna, faixa, workflow e etiquetas.
- kanban_add_comment e kanban_link_cards: registram contexto e relações entre cartões do mesmo quadro.
- kanban_run_card: inicia o workflow escolhido no cartão. Isso executa agentes e integrações reais; use apenas quando pedido.
- kanban_delete_card: remove um cartão. Use apenas quando pedido explicitamente.

## Fluxo de trabalho
1. Liste os quadros e escolha o quadro indicado pela solicitação. Se houver ambiguidade que mude a ação, pergunte qual quadro usar.
2. Leia o quadro com kanban_get_board antes de editar. Copie os IDs válidos da resposta; não invente IDs.
3. Faça apenas as alterações solicitadas. Preserve campos, etiquetas, relações e workflows já existentes que não precisam mudar.
4. Depois de alterar, leia o quadro novamente e confirme o estado final. Relate o nome do quadro, cartão e coluna usados e qualquer erro retornado.
5. Se uma ferramenta retornar erro, pare a ação dependente, mostre o motivo e peça os dados que faltam. Não repita uma operação destrutiva às cegas.`
};
const defaultAgents = [
  { id: 'agent-planner', name: 'Planejador', runner: 'codex', model: 'gpt-6-luna', effort: 'high', harness: 'codex', skillIds: [DEFAULT_KANBAN_SKILL_ID], prompt: 'Analise a solicitação, identifique requisitos, critérios de aceite e riscos. Produza um plano conciso antes de implementar.' },
  { id: 'agent-builder', name: 'Implementador', runner: 'codex', model: 'gpt-6-luna', effort: 'high', harness: 'codex', skillIds: [DEFAULT_KANBAN_SKILL_ID], prompt: 'Implemente a solicitação no workspace. Preserve o estilo do projeto, execute as validações disponíveis e relate os arquivos alterados.' },
  { id: 'agent-reviewer', name: 'Revisor de qualidade', runner: 'codex', model: 'gpt-6-luna', effort: 'high', harness: 'codex', skillIds: [DEFAULT_KANBAN_SKILL_ID], prompt: 'Revise as alterações procurando defeitos, riscos e critérios não atendidos. Corrija problemas seguros e reporte evidências.' }
];
const defaultSettings = {
  defaultRunner: 'codex', defaultModel: 'gpt-6-luna', defaultEffort: 'high',
  agentTimeoutMinutes: 15, integrationTimeoutMinutes: 5, maxConcurrentRuns: 3,
  defaultExecutionTarget: 'container', kubernetesNamespace: 'default', kubernetesContext: '',
  kubernetesImage: '', kubernetesWorkspacePvc: '', kubernetesWorkspaceSubPath: '', kubernetesKubeconfigPath: ''
};

function redactSecrets(value) {
  return String(value)
    .replace(/\b(sk-(?:ant-)?)[A-Za-z0-9_-]{8,}\b/g, '$1[REDACTED]')
    .replace(/\b(gh[pousr]_|github_pat_)[A-Za-z0-9_]{8,}\b/g, '$1[REDACTED]')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+/gi, '$1[REDACTED]');
}

function summarizeRunnerLine(runner, line) {
  const clean = String(line).replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '').trim();
  if (!clean) return [];
  let event;
  try { event = JSON.parse(clean); } catch { return [{ level: 'output', message: clean }]; }
  if (runner === 'claude' && typeof event.result === 'string') return [{ level: 'output', message: event.result }];
  const messages = [];
  if (event.type === 'thread.started' && event.thread_id) messages.push({ level: 'info', message: `Sessão iniciada · ${event.thread_id}` });
  else if (event.type === 'turn.started') messages.push({ level: 'info', message: 'Agente começou a trabalhar.' });
  else if (event.type === 'turn.completed') {
    const usage = event.usage;
    messages.push({ level: 'success', message: usage ? `Turno concluído · ${Number(usage.input_tokens || 0).toLocaleString('pt-BR')} tokens de entrada · ${Number(usage.output_tokens || 0).toLocaleString('pt-BR')} de saída.` : 'Turno concluído.' });
  } else if (event.type === 'item.started' && event.item?.type === 'command_execution') {
    messages.push({ level: 'command', message: `Executando comando: ${event.item.command || 'comando do agente'}` });
  } else if (event.type === 'item.completed' && event.item?.type === 'command_execution') {
    const item = event.item; const exit = item.exit_code;
    messages.push({ level: exit === 0 ? 'success' : exit == null ? 'info' : 'warning', message: `Comando finalizado${exit == null ? '' : ` · código ${exit}`}.` });
    if (item.aggregated_output?.trim()) messages.push({ level: exit === 0 ? 'output' : 'warning', message: item.aggregated_output.trim() });
  } else if (event.type === 'item.completed' && event.item?.type === 'agent_message' && event.item.text?.trim()) {
    messages.push({ level: 'output', message: event.item.text.trim() });
  } else if (event.type === 'item.completed' && event.item?.type === 'file_change') {
    const changes = event.item.changes || [];
    if (changes.length) messages.push({ level: 'success', message: `Arquivos alterados: ${changes.map(change => `${change.path} (${change.kind})`).join(', ')}` });
  } else if (event.type === 'error' || event.type === 'turn.failed') {
    messages.push({ level: 'error', message: event.message || event.error?.message || JSON.stringify(event) });
  } else if (runner === 'opencode' && (event.type === 'text' || event.part?.type === 'text')) {
    const text = event.text || event.part?.text; if (text?.trim()) messages.push({ level: 'output', message: text.trim() });
  } else if (runner === 'opencode' && (event.type === 'tool_use' || event.type === 'tool_result')) {
    const content = event.command || event.title || event.output || event.part?.text;
    messages.push({ level: event.type === 'tool_result' && event.error ? 'warning' : 'command', message: `${event.type === 'tool_use' ? 'Ferramenta iniciada' : 'Resultado da ferramenta'}${content ? `: ${content}` : '.'}` });
  } else if (event.type) messages.push({ level: 'info', message: `Evento do agente: ${event.type}.` });
  return messages;
}

function extractRunnerResponse(runner, output, stderr = '') {
  const source = String(output || '').trim();
  if (runner === 'codex') {
    const messages = source.split(/\r?\n/).flatMap(line => {
      try { const event = JSON.parse(line); return event.type === 'item.completed' && event.item?.type === 'agent_message' && event.item.text ? [event.item.text] : []; }
      catch { return []; }
    });
    if (messages.length) return messages.at(-1).trim();
  }
  if (runner === 'claude' || runner === 'opencode') {
    try {
      const value = JSON.parse(source);
      if (typeof value.result === 'string') return value.result;
      if (typeof value.text === 'string') return value.text;
      if (typeof value.output === 'string') return value.output;
    } catch { /* line-based or plain-text runner output */ }
    const messages = source.split(/\r?\n/).flatMap(line => {
      try { const event = JSON.parse(line); const text = event.text || event.part?.text; return typeof text === 'string' ? [text] : []; }
      catch { return []; }
    });
    if (messages.length) return messages.join('\n').trim();
  }
  return source || String(stderr || '').trim();
}

function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' });
  res.end(body);
}

async function readBody(req) {
  const chunks = []; let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > MAX_BODY) throw Object.assign(new Error('Corpo da solicitação excede 2 MB.'), { status: 413 });
    chunks.push(chunk);
  }
  if (!length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('JSON inválido.'), { status: 400 }); }
}

function validateWorkflow(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) throw new Error('Workflow inválido: informe etapas e conexões.');
  if (value.nodes.length < 1 || value.nodes.length > 100) throw new Error('O workflow precisa ter de 1 a 100 etapas.');
  if (value.edges.length > 500) throw new Error('O workflow pode ter até 500 conexões.');
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 120) throw Object.assign(new Error('O nome do workflow precisa ter de 1 a 120 caracteres.'), { status: 400 });
  const target = String(value.execution?.target || 'container').toLowerCase();
  const frameworks = value.execution?.frameworks == null ? [] : value.execution.frameworks;
  if (!['container', 'kubernetes'].includes(target)) throw Object.assign(new Error('Ambiente de execução inválido. Escolha Container ou Kubernetes.'), { status: 400 });
  if (!Array.isArray(frameworks) || frameworks.length > runtimeFrameworks.length || frameworks.some(id => !runtimeFrameworkIds.has(id))) throw Object.assign(new Error('Seleção de frameworks inválida para este workflow.'), { status: 400 });
  value.execution = { target, frameworks: [...new Set(frameworks)] };
  const ids = new Set();
  for (const node of value.nodes) {
    if (!node || typeof node !== 'object' || !ID.test(String(node.id || '')) || ids.has(node.id)) throw new Error('Cada etapa precisa ter um identificador único válido.');
    ids.add(node.id);
    if (!['trigger', 'agent', 'subworkflow', 'approval', 'integration', 'condition'].includes(node.type)) throw new Error(`Tipo de etapa inválido: ${node.type}`);
    if (typeof node.name !== 'string' || !node.name.trim() || node.name.length > 120) throw new Error('Cada etapa precisa ter um nome de até 120 caracteres.');
    if (node.config && typeof node.config !== 'object') throw new Error('Configuração de etapa inválida.');
    const config = node.config || {};
    if (config.datasetIds != null) validateDatasetIds(config.datasetIds, node.name);
    if (config.skillIds != null) validateSkillIds(config.skillIds, node.name);
    if (node.type === 'agent' && ((config.prompt != null && (typeof config.prompt !== 'string' || config.prompt.length > 15_000)) || (config.model != null && (typeof config.model !== 'string' || config.model.length > 120)) || (config.runner != null && !['codex', 'claude', 'opencode'].includes(config.runner)) || (config.effort != null && !['low', 'medium', 'high', 'xhigh', 'max'].includes(config.effort)))) throw Object.assign(new Error(`Configuração inválida para o agente “${node.name}”.`), { status: 400 });
    if (node.type === 'approval' && config.message != null && (typeof config.message !== 'string' || config.message.length > 1000)) throw Object.assign(new Error(`A mensagem de aprovação “${node.name}” pode ter até 1.000 caracteres.`), { status: 400 });
    if (node.type === 'condition' && config.contains != null && (typeof config.contains !== 'string' || config.contains.length > 500)) throw Object.assign(new Error(`A condição “${node.name}” pode ter até 500 caracteres.`), { status: 400 });
    if (node.type === 'integration' && config.command != null && (typeof config.command !== 'string' || config.command.length > 4000)) throw Object.assign(new Error(`O comando de integração “${node.name}” pode ter até 4.000 caracteres.`), { status: 400 });
    if (node.type === 'subworkflow' && node.children != null) {
      if (!Array.isArray(node.children) || node.children.length > 100 || (node.childEdges != null && !Array.isArray(node.childEdges))) throw Object.assign(new Error(`Sub-workflow inválido: ${node.name}.`), { status: 400 });
      if (node.children.length) {
        const childEdges = node.childEdges || node.children.slice(1).map((child, index) => [node.children[index].id, child.id]);
        validateWorkflow({ id: node.id, name: node.name, nodes: node.children, edges: childEdges });
      }
    }
  }
  for (const edge of value.edges) if (!Array.isArray(edge) || edge.length !== 2 || !ids.has(edge[0]) || !ids.has(edge[1]) || edge[0] === edge[1]) throw new Error('Conexão de etapas inválida.');
  sortNodes(value.nodes, value.edges);
  return value;
}

function validateDatasetIds(value, context = 'etapa') {
  if (!Array.isArray(value) || value.length > 100 || value.some(id => typeof id !== 'string' || !ID.test(id))) throw Object.assign(new Error(`Seleção de datasets inválida em “${context}” (limite de 100).`), { status: 400 });
  return [...new Set(value)];
}

function validateSkillIds(value, context = 'etapa') {
  if (!Array.isArray(value) || value.length > 100 || value.some(id => typeof id !== 'string' || !ID.test(id))) throw Object.assign(new Error(`Seleção de Skills inválida em “${context}” (limite de 100).`), { status: 400 });
  return [...new Set(value)];
}

function workflowDatasetIds(nodes) {
  return nodes.flatMap(node => [
    ...(Array.isArray(node.config?.datasetIds) ? node.config.datasetIds : []),
    ...(node.type === 'subworkflow' ? workflowDatasetIds(node.children || []) : [])
  ]);
}

function workflowSkillIds(nodes) {
  return nodes.flatMap(node => [
    ...(Array.isArray(node.config?.skillIds) ? node.config.skillIds : []),
    ...(node.type === 'subworkflow' ? workflowSkillIds(node.children || []) : [])
  ]);
}

function sortNodes(nodes, edges) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const indegree = new Map(nodes.map(node => [node.id, 0]));
  const outgoing = new Map(nodes.map(node => [node.id, []]));
  for (const [from, to] of edges) {
    if (!byId.has(from) || !byId.has(to)) throw new Error('Conexão aponta para uma etapa inexistente.');
    if (outgoing.get(from).includes(to)) continue;
    outgoing.get(from).push(to); indegree.set(to, indegree.get(to) + 1);
  }
  const ready = nodes.filter(node => indegree.get(node.id) === 0);
  const ordered = [];
  while (ready.length) {
    const current = ready.shift(); ordered.push(current);
    for (const next of outgoing.get(current.id)) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) ready.push(byId.get(next));
    }
  }
  if (ordered.length !== nodes.length) throw new Error('O workflow contém um ciclo. Remova uma conexão circular para continuar.');
  return ordered;
}

function parseCredential(record) {
  const key = Buffer.from(record.key, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(record.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(record.data, 'base64')), decipher.final()]).toString('utf8');
}

function encryptCredential(value, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
}

async function detectRunner(command, label) {
  try {
    const { stdout } = await execFileAsync(command, ['--version'], { timeout: 4000, windowsHide: true, maxBuffer: 32 * 1024 });
    return { id: label, installed: true, version: stdout.trim().split(/\r?\n/)[0].slice(0, 100) };
  } catch (error) {
    if (error.code === 'ENOENT') return { id: label, installed: false, version: null };
    return { id: label, installed: true, version: 'Instalado · verificação indisponível' };
  }
}

function runProcess(command, args, { cwd, env, input, timeoutMs = 15 * 60_000, onOutput, signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, shell: false });
    let output = ''; let errors = ''; let settled = false;
    const append = (stream, value) => {
      const text = value.toString('utf8');
      if (stream === 'stderr') errors = (errors + text).slice(-40_000);
      else output = (output + text).slice(-80_000);
      onOutput?.(stream, text);
    };
    child.stdout.on('data', chunk => append('stdout', chunk));
    child.stderr.on('data', chunk => append('stderr', chunk));
    child.once('error', error => { settled = true; clearTimeout(timer); reject(error); });
    child.once('close', code => {
      if (settled) return; settled = true; clearTimeout(timer);
      if (code === 0) resolve({ output: output.trim(), stderr: errors.trim(), exitCode: code });
      else reject(Object.assign(new Error(`${command} encerrou com código ${code}.${errors ? ` ${errors.trim().slice(-2500)}` : ''}`), { code, output: output.trim() }));
    });
    const abort = () => child.kill('SIGTERM');
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => { child.kill('SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 5000).unref(); }, timeoutMs);
    child.stdin.end(input || '');
  });
}

export function createAppServer({ dataDir = process.env.DATA_DIR || path.resolve(here, '..', 'data'), workspaceDir = process.env.WORKSPACE_DIR || '/workspace', cliProbe = null, commandExecutor = runProcess, kubernetesExecutor = runProcess, logger = console } = {}) {
  const activeRuns = new Map();
  const runSubscribers = new Map();
  const persistQueues = new Map();
  const persistTimers = new Map();
  const mutationQueues = new Map();
  const executionQueue = [];
  let activeExecutionCount = 0;
  let orphanedRunRecovery;
  const executionPath = path.resolve(workspaceDir);
  const dataPath = path.resolve(dataDir);
  const files = {
    legacyWorkflow: path.join(dataPath, 'workflow.json'), workflows: path.join(dataPath, 'workflows.json'), activeWorkflow: path.join(dataPath, 'active-workflow.json'),
    agents: path.join(dataPath, 'agents.json'), skills: path.join(dataPath, 'skills.json'), settings: path.join(dataPath, 'settings.json'), runs: path.join(dataPath, 'runs.json'), credentials: path.join(dataPath, 'credentials.json'), datasets: path.join(dataPath, 'datasets'), boards: path.join(dataPath, 'boards.json'), boardAttachments: path.join(dataPath, 'board-attachments')
  };
  let encryptionKey; let workflowStorageReady;

  async function writeJsonAtomic(file, value) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
    let renamed = false;
    try {
      for (let attempt = 0; ; attempt++) {
        try { await fs.rename(temp, file); renamed = true; break; }
        catch (error) {
          if (!['EPERM', 'EBUSY', 'ENOTEMPTY'].includes(error.code) || attempt >= 7) throw error;
          await new Promise(resolve => setTimeout(resolve, 15 * (attempt + 1)));
        }
      }
    } finally {
      if (!renamed) await fs.rm(temp, { force: true }).catch(() => {});
    }
  }
  async function serializeMutation(key, operation) {
    const previous = mutationQueues.get(key) || Promise.resolve();
    const current = previous.catch(() => {}).then(operation);
    mutationQueues.set(key, current);
    try { return await current; }
    finally { if (mutationQueues.get(key) === current) mutationQueues.delete(key); }
  }
  async function loadJson(file, fallback) {
    try { return JSON.parse(await fs.readFile(file, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return structuredClone(fallback); throw error; }
  }
  async function getKey() {
    if (encryptionKey) return encryptionKey;
    await fs.mkdir(dataPath, { recursive: true });
    try { encryptionKey = await fs.readFile(path.join(dataPath, '.credential-key')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const candidate = crypto.randomBytes(32);
      try { await fs.writeFile(path.join(dataPath, '.credential-key'), candidate, { flag: 'wx', mode: 0o600 }); encryptionKey = candidate; }
      catch (writeError) { if (writeError.code !== 'EEXIST') throw writeError; encryptionKey = await fs.readFile(path.join(dataPath, '.credential-key')); }
    }
    if (encryptionKey.length !== 32) throw new Error('Chave de criptografia inválida; restaure o volume de dados completo.');
    return encryptionKey;
  }
  function logToConsole(level, message, run = null) {
    const now = new Date().toISOString().slice(11, 19);
    const labels = { info: 'INFO', success: 'OK', warning: 'AVISO', error: 'ERRO', command: 'CMD', output: 'SAÍDA' };
    const icons = { info: 'ℹ', success: '✓', warning: '⚠', error: '✖', command: '›', output: '·' };
    const colors = { info: '\u001b[36m', success: '\u001b[32m', warning: '\u001b[33m', error: '\u001b[31m', command: '\u001b[35m', output: '\u001b[90m' };
    const reset = process.stdout.isTTY ? '\u001b[0m' : '';
    const color = process.stdout.isTTY ? colors[level] || '' : '';
    const scope = run ? ` [${run.id.slice(0, 8)}]` : '';
    const safe = redactSecrets(message).replace(/\r/g, '').slice(0, 3000);
    const method = level === 'error' ? 'error' : level === 'warning' ? 'warn' : 'log';
    const write = logger[method] || logger.log || (() => {});
    for (const part of safe.split('\n')) {
      const line = `${color}${now} ${icons[level] || '·'} ${labels[level] || 'INFO'}${scope}${reset} ${part}`;
      write.call(logger, line);
    }
  }
  function publish(runId, event, payload) {
    const clients = runSubscribers.get(runId); if (!clients?.size) return;
    const packet = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const response of clients) {
      try { if (!response.destroyed) response.write(packet); else clients.delete(response); }
      catch { clients.delete(response); }
    }
    if (!clients.size) runSubscribers.delete(runId);
  }
  function isRuntimeRunActive(runId) { return activeRuns.has(runId) || executionQueue.some(item => item.run.id === runId); }
  async function recoverOrphanedRuns() {
    if (!orphanedRunRecovery) orphanedRunRecovery = (async () => {
      const runs = await loadJson(files.runs, []);
      for (const run of runs) {
        if (!['queued', 'running', 'waiting_approval'].includes(run.status) || isRuntimeRunActive(run.id)) continue;
        const now = new Date().toISOString(); const message = 'Execução interrompida porque o runtime reiniciou antes da conclusão.';
        run.status = 'failed'; run.error = message; run.interrupted = true; run.finishedAt = now;
        const runningStep = [...(run.steps || [])].reverse().find(step => step.status === 'running');
        if (runningStep) { runningStep.status = 'failed'; runningStep.error = message; runningStep.finishedAt = now; }
        run.log ||= []; run.log.push({ at: now, level: 'error', message });
        if (run.log.length > 300) run.log.splice(0, run.log.length - 300);
        await persistRun(run); logToConsole('warning', message, run);
      }
    })();
    await orphanedRunRecovery;
  }
  async function readRunHistory() { await recoverOrphanedRuns(); return loadJson(files.runs, []); }
  function publicRunState(run) {
    return { id: run.id, workflowId: run.workflowId, workflowName: run.workflowName, status: run.status, runtimeActive: isRuntimeRunActive(run.id), pendingApproval: run.pendingApproval || null, steps: (run.steps || []).map(({ nodeId, name, type, status, error, startedAt, finishedAt, graphPath }) => ({ nodeId, name, type, status, error, startedAt, finishedAt, graphPath: graphPath || [] })) };
  }
  function addRunLog(run, message, level = 'info') {
    const entry = { at: new Date().toISOString(), level, message: redactSecrets(message).slice(0, 3000) };
    run.log.push(entry);
    if (run.log.length > 300) run.log.splice(0, run.log.length - 300);
    logToConsole(level, entry.message, run);
    publish(run.id, 'log', entry);
    publish(run.id, 'state', publicRunState(run));
    return entry;
  }
  function scheduleRunPersist(run) {
    if (persistTimers.has(run.id)) return;
    const timer = setTimeout(() => {
      persistTimers.delete(run.id);
      void persistRun(run).catch(error => logToConsole('error', `Não foi possível salvar os logs da execução: ${error.message}`, run));
    }, 300);
    timer.unref?.(); persistTimers.set(run.id, timer);
  }
  async function ensureWorkflowStorage() {
    if (workflowStorageReady) return workflowStorageReady;
    workflowStorageReady = (async () => {
      let workflows = await loadJson(files.workflows, null);
      if (!Array.isArray(workflows) || !workflows.length) {
        const legacy = await loadJson(files.legacyWorkflow, null);
        workflows = [validateWorkflow(legacy || structuredClone(defaultWorkflow))];
        await writeJsonAtomic(files.workflows, workflows);
      }
      workflows = workflows.map(workflow => validateWorkflow(workflow));
      let activeId = await loadJson(files.activeWorkflow, null);
      if (!workflows.some(workflow => workflow.id === activeId)) {
        activeId = workflows[0].id;
        await writeJsonAtomic(files.activeWorkflow, activeId);
      }
      return { workflows, activeId };
    })();
    try { return await workflowStorageReady; }
    catch (error) { workflowStorageReady = null; throw error; }
  }
  async function readWorkflows() { return (await ensureWorkflowStorage()).workflows; }
  async function readWorkflow(id = null) {
    const storage = await ensureWorkflowStorage(); const workflowId = id || storage.activeId;
    const workflow = storage.workflows.find(item => item.id === workflowId);
    if (!workflow) throw Object.assign(new Error(`Workflow não encontrado: ${workflowId}`), { status: 404 });
    return workflow;
  }
  async function writeWorkflow(workflowId, value) {
    return serializeMutation(files.workflows, async () => {
      let workflow;
      try { workflow = validateWorkflow(value); } catch (error) { error.status ||= 400; throw error; }
      await ensureDatasetReferences(workflowDatasetIds(workflow.nodes));
      await ensureSkillReferences(workflowSkillIds(workflow.nodes));
      workflow.id = workflowId; workflow.name = workflow.name.trim(); workflow.updatedAt = new Date().toISOString();
      const storage = await ensureWorkflowStorage(); const index = storage.workflows.findIndex(item => item.id === workflowId);
      if (index < 0) throw Object.assign(new Error(`Workflow não encontrado: ${workflowId}`), { status: 404 });
      if (storage.workflows.some((item, position) => position !== index && item.name.toLowerCase() === workflow.name.toLowerCase())) throw Object.assign(new Error('Já existe um workflow com esse nome.'), { status: 409 });
      storage.workflows[index] = workflow; await writeJsonAtomic(files.workflows, storage.workflows);
      logToConsole('success', `Workflow salvo: ${workflow.name} · ${workflow.nodes.length} etapas · ambiente ${workflow.execution.target}.`);
      return workflow;
    });
  }
  async function activateWorkflow(workflowId) {
    return serializeMutation(files.workflows, async () => {
      const storage = await ensureWorkflowStorage();
      if (!storage.workflows.some(workflow => workflow.id === workflowId)) throw Object.assign(new Error(`Workflow não encontrado: ${workflowId}`), { status: 404 });
      storage.activeId = workflowId; await writeJsonAtomic(files.activeWorkflow, workflowId);
      const selected = storage.workflows.find(workflow => workflow.id === workflowId);
      logToConsole('info', `Workflow principal selecionado: ${selected.name} · ambiente ${selected.execution?.target || 'container'}.`);
      return selected;
    });
  }
  async function readAgents() {
    const agents = await loadJson(files.agents, defaultAgents);
    if (!Array.isArray(agents)) throw new Error('Cadastro de agentes inválido.');
    if (!agents.length && !(await fs.access(files.agents).then(() => true).catch(() => false))) await writeJsonAtomic(files.agents, agents);
    return agents;
  }
  let defaultKanbanSkillSeed;
  async function readSkills() {
    const skills = await loadJson(files.skills, []);
    if (!Array.isArray(skills)) throw new Error('Biblioteca de Skills inválida.');
    if (skills.some(item => item.id === DEFAULT_KANBAN_SKILL_ID)) return skills;
    if (!defaultKanbanSkillSeed) defaultKanbanSkillSeed = (async () => {
      const latest = await loadJson(files.skills, []);
      if (!Array.isArray(latest)) throw new Error('Biblioteca de Skills inválida.');
      if (!latest.some(item => item.id === DEFAULT_KANBAN_SKILL_ID)) {
        latest.unshift({ ...DEFAULT_KANBAN_SKILL, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        await writeJsonAtomic(files.skills, latest);
      }
      return latest;
    })().catch(error => { defaultKanbanSkillSeed = null; throw error; });
    return defaultKanbanSkillSeed;
  }
  function validateSkill(value, id = value?.id || crypto.randomUUID()) {
    if (!value || typeof value !== 'object') throw Object.assign(new Error('Dados da Skill inválidos.'), { status: 400 });
    const name = String(value.name || '').trim(); const description = String(value.description || '').trim(); const instructions = String(value.instructions || '').trim();
    if (!name || name.length > 120 || description.length > 300 || !instructions || instructions.length > MAX_SKILL_INSTRUCTIONS) throw Object.assign(new Error('Informe nome, descrição de até 300 caracteres e instruções de até 30 mil caracteres.'), { status: 400 });
    return { id, name, description, instructions, ...(id === DEFAULT_KANBAN_SKILL_ID ? { isDefault: true } : {}), createdAt: value.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
  }
  async function ensureSkillReferences(ids) {
    const available = new Set((await readSkills()).map(item => item.id));
    for (const id of new Set(ids)) if (!available.has(id)) throw Object.assign(new Error(`A Skill “${id}” não existe. Atualize a biblioteca e tente novamente.`), { status: 400 });
  }
  async function skillContext(ids = []) {
    if (!ids.length) return '';
    const byId = new Map((await readSkills()).map(item => [item.id, item]));
    return ids.map(id => {
      const skill = byId.get(id);
      if (!skill) throw new Error(`Skill não encontrada: ${id}`);
      return `## Skill: ${skill.name}${skill.description ? `\n${skill.description}` : ''}\n${skill.instructions}`;
    }).join('\n\n').slice(0, MAX_SKILL_INSTRUCTIONS);
  }
  async function readSettings() {
    const stored = await loadJson(files.settings, defaultSettings);
    return { ...defaultSettings, ...stored };
  }
  function validateSettings(value) {
    const runner = String(value.defaultRunner || 'codex').toLowerCase();
    const model = String(value.defaultModel || '').trim(); const effort = String(value.defaultEffort || 'high');
    const agentTimeoutMinutes = Number(value.agentTimeoutMinutes); const integrationTimeoutMinutes = Number(value.integrationTimeoutMinutes); const maxConcurrentRuns = Number(value.maxConcurrentRuns);
    if (!['codex', 'claude', 'opencode'].includes(runner) || !model || model.length > 120 || !['low', 'medium', 'high', 'xhigh', 'max'].includes(effort)) throw Object.assign(new Error('Runner, modelo ou esforço padrão inválido.'), { status: 400 });
    if (!Number.isInteger(agentTimeoutMinutes) || agentTimeoutMinutes < 1 || agentTimeoutMinutes > 120 || !Number.isInteger(integrationTimeoutMinutes) || integrationTimeoutMinutes < 1 || integrationTimeoutMinutes > 60 || !Number.isInteger(maxConcurrentRuns) || maxConcurrentRuns < 1 || maxConcurrentRuns > 8) throw Object.assign(new Error('Limites fora do intervalo permitido (agente 1–120 min, integração 1–60 min, execuções 1–8).'), { status: 400 });
    const defaultExecutionTarget = String(value.defaultExecutionTarget || 'container').toLowerCase();
    const kubernetesNamespace = String(value.kubernetesNamespace || 'default').trim();
    const kubernetesContext = String(value.kubernetesContext || '').trim();
    const kubernetesImage = String(value.kubernetesImage || '').trim();
    const kubernetesWorkspacePvc = String(value.kubernetesWorkspacePvc || '').trim();
    const kubernetesWorkspaceSubPath = String(value.kubernetesWorkspaceSubPath || '').trim();
    const kubernetesKubeconfigPath = String(value.kubernetesKubeconfigPath || '').trim();
    const dnsLabel = /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/;
    if (!['container', 'kubernetes'].includes(defaultExecutionTarget)) throw Object.assign(new Error('Ambiente padrão inválido. Escolha Container ou Kubernetes.'), { status: 400 });
    if (!dnsLabel.test(kubernetesNamespace) || kubernetesNamespace.length > 63) throw Object.assign(new Error('Namespace Kubernetes inválido. Use letras minúsculas, números e hífens.'), { status: 400 });
    if (kubernetesContext.length > 120 || (kubernetesImage && (kubernetesImage.length > 255 || !/^[a-zA-Z0-9][a-zA-Z0-9._:/@-]*$/.test(kubernetesImage)))) throw Object.assign(new Error('Contexto ou imagem Kubernetes inválidos.'), { status: 400 });
    if (kubernetesWorkspacePvc && (!dnsLabel.test(kubernetesWorkspacePvc) || kubernetesWorkspacePvc.length > 63)) throw Object.assign(new Error('Nome do PVC inválido. Use letras minúsculas, números e hífens.'), { status: 400 });
    if (kubernetesWorkspaceSubPath.length > 200 || kubernetesWorkspaceSubPath.split('/').some(part => part === '..')) throw Object.assign(new Error('Subpasta do workspace inválida.'), { status: 400 });
    if (kubernetesKubeconfigPath.length > 300 || (kubernetesKubeconfigPath && !path.isAbsolute(kubernetesKubeconfigPath))) throw Object.assign(new Error('O caminho do kubeconfig deve ser absoluto dentro do container.'), { status: 400 });
    return { defaultRunner: runner, defaultModel: model, defaultEffort: effort, agentTimeoutMinutes, integrationTimeoutMinutes, maxConcurrentRuns, defaultExecutionTarget, kubernetesNamespace, kubernetesContext, kubernetesImage, kubernetesWorkspacePvc, kubernetesWorkspaceSubPath, kubernetesKubeconfigPath };
  }
  async function writeSettings(value) {
    return serializeMutation(files.settings, async () => {
      const next = validateSettings({ ...await readSettings(), ...value }); await writeJsonAtomic(files.settings, next);
      logToConsole('success', `Configurações atualizadas · runner ${next.defaultRunner}/${next.defaultModel} · ambiente padrão ${next.defaultExecutionTarget} · ${next.maxConcurrentRuns} execuções simultâneas.`);
      return next;
    });
  }
  const defaultBoardColumns = [{ id: 'backlog', name: 'Backlog', color: '#7e82a0' }, { id: 'in-progress', name: 'Em andamento', color: '#8f72ed' }, { id: 'review', name: 'Revisão', color: '#e0a647' }, { id: 'done', name: 'Concluído', color: '#43b78d' }];
  function validateBoardLayout(value, fallback) {
    const source = Array.isArray(value) ? value : fallback;
    if (!source.length || source.length > 20) throw Object.assign(new Error('O quadro precisa ter de 1 a 20 colunas e faixas.'), { status: 400 });
    const seen = new Set();
    return source.map(item => {
      const name = String(typeof item === 'string' ? item : item?.name || '').trim();
      const id = String(typeof item === 'object' ? item.id || safeBoardId(name) : safeBoardId(name));
      if (!name || name.length > 80 || !ID.test(id) || seen.has(id)) throw Object.assign(new Error('Nome ou identificador de coluna/faixa inválido.'), { status: 400 });
      seen.add(id);
      const color = /^#[0-9a-f]{6}$/i.test(String(item?.color || '')) ? item.color : '#8f72ed';
      return { id, name, color };
    });
  }
  function safeBoardId(value) { return String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || `item-${crypto.randomUUID().slice(0, 8)}`; }
  function validateBoardLabels(value, fallback = []) {
    const source = Array.isArray(value) ? value : fallback;
    if (source.length > 50) throw Object.assign(new Error('O quadro pode ter até 50 etiquetas.'), { status: 400 });
    const seen = new Set();
    return source.map((item, index) => {
      const name = String(typeof item === 'string' ? item : item?.name || '').trim();
      const id = String(typeof item === 'object' ? item.id || safeBoardId(name) : safeBoardId(name));
      if (!name || name.length > 50 || !ID.test(id) || seen.has(id)) throw Object.assign(new Error('Nome ou identificador de etiqueta inválido.'), { status: 400 });
      seen.add(id);
      const color = /^#[0-9a-f]{6}$/i.test(String(item?.color || '')) ? item.color : ['#8f72ed', '#6482de', '#43b78d', '#e0a647', '#df687b'][index % 5];
      return { id, name, color };
    });
  }
  function validateBoardCustomFields(value, fallback = []) {
    const source = Array.isArray(value) ? value : fallback;
    if (source.length > 30) throw Object.assign(new Error('O quadro pode ter até 30 campos personalizados.'), { status: 400 });
    const seen = new Set();
    return source.map(item => {
      const name = String(item?.name || '').trim(); const id = String(item?.id || safeBoardId(name)); const type = String(item?.type || 'text');
      if (!name || name.length > 80 || !ID.test(id) || seen.has(id) || !['text', 'number', 'date', 'select', 'checkbox'].includes(type)) throw Object.assign(new Error('Revise o nome e o tipo dos campos personalizados.'), { status: 400 });
      seen.add(id);
      const options = [...new Set((Array.isArray(item.options) ? item.options : []).map(option => String(option).trim()).filter(Boolean))].slice(0, 30);
      if (type === 'select' && !options.length) throw Object.assign(new Error(`Informe pelo menos uma opção para o campo “${name}”.`), { status: 400 });
      return { id, name, type, options, required: item.required === true };
    });
  }
  function appendCardHistory(card, action, message) {
    card.history ||= [];
    card.history.push({ id: `event-${crypto.randomUUID()}`, action, message: String(message).slice(0, 300), createdAt: new Date().toISOString() });
    if (card.history.length > 250) card.history.splice(0, card.history.length - 250);
  }
  function normalizeCardCustomFields(definitions, input = {}, existing = {}, requireRequired = false) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw Object.assign(new Error('Os valores dos campos personalizados são inválidos.'), { status: 400 });
    const result = {};
    for (const field of definitions) {
      const supplied = Object.hasOwn(input, field.id); const raw = supplied ? input[field.id] : existing[field.id];
      if (raw == null || raw === '') {
        if (field.required && requireRequired) throw Object.assign(new Error(`Preencha o campo “${field.name}”.`), { status: 400 });
        if (field.type === 'checkbox') result[field.id] = raw === true;
        continue;
      }
      let value = raw;
      if (field.type === 'text') value = String(raw).trim().slice(0, 5000);
      else if (field.type === 'number') { value = Number(raw); if (!Number.isFinite(value)) throw Object.assign(new Error(`O campo “${field.name}” precisa ser um número.`), { status: 400 }); }
      else if (field.type === 'date') { value = String(raw); if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Object.assign(new Error(`Informe uma data válida no campo “${field.name}”.`), { status: 400 }); }
      else if (field.type === 'select') { value = String(raw); if (!field.options.includes(value)) throw Object.assign(new Error(`Escolha uma opção válida para “${field.name}”.`), { status: 400 }); }
      else if (field.type === 'checkbox') value = raw === true || raw === 'true' || raw === 1;
      if (requireRequired && field.required && (value === '' || value == null)) throw Object.assign(new Error(`Preencha o campo “${field.name}”.`), { status: 400 });
      if (requireRequired && field.required && field.type === 'checkbox' && value !== true) throw Object.assign(new Error(`Marque o campo “${field.name}”.`), { status: 400 });
      result[field.id] = value;
    }
    return result;
  }
  function safeAttachmentFilename(value) {
    const filename = String(value || 'arquivo').replace(/[\\/]/g, '_').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 180);
    return filename && filename !== '.' && filename !== '..' ? filename : 'arquivo';
  }
  async function readBoards() {
    const boards = await loadJson(files.boards, []);
    if (!Array.isArray(boards)) throw new Error('Cadastro de quadros inválido.');
    return boards;
  }
  async function validateBoard(value, id = value?.id || `board-${crypto.randomUUID()}`, existing = null) {
    const name = String(value?.name ?? existing?.name ?? '').trim();
    if (!name || name.length > 120) throw Object.assign(new Error('Informe o nome do quadro com até 120 caracteres.'), { status: 400 });
    const workflows = await readWorkflows(); const availableWorkflowIds = new Set(workflows.map(workflow => workflow.id));
    const requestedWorkflowIds = Array.isArray(value?.workflowIds) ? value.workflowIds : (existing?.workflowIds || [existing?.workflowId]).filter(Boolean);
    const workflowIds = [...new Set(requestedWorkflowIds.map(item => String(item).trim()).filter(Boolean))];
    const requestedPrimary = String(value?.workflowId ?? existing?.workflowId ?? workflowIds[0] ?? '');
    if (requestedPrimary && !workflowIds.includes(requestedPrimary)) workflowIds.unshift(requestedPrimary);
    if (!workflowIds.length || workflowIds.some(workflowId => !availableWorkflowIds.has(workflowId))) throw Object.assign(new Error('Associe o quadro a pelo menos um workflow existente.'), { status: 400 });
    if (workflowIds.length > 20) throw Object.assign(new Error('Associe até 20 workflows ao quadro.'), { status: 400 });
    const workflowId = workflowIds.includes(requestedPrimary) ? requestedPrimary : workflowIds[0];
    const columns = validateBoardLayout(value?.columns, existing?.columns || defaultBoardColumns);
    const lanes = validateBoardLayout(value?.lanes, existing?.lanes || [{ id: 'general', name: 'Geral', color: '#6482de' }]);
    const labels = validateBoardLabels(value?.labels, existing?.labels || []); const customFields = validateBoardCustomFields(value?.customFields, existing?.customFields || []);
    const cards = (existing?.cards || []).map(card => ({ ...card, columnId: columns.some(item => item.id === card.columnId) ? card.columnId : columns[0].id, laneId: lanes.some(item => item.id === card.laneId) ? card.laneId : lanes[0].id, workflowId: workflowIds.includes(card.workflowId) ? card.workflowId : workflowId, labels: Array.isArray(card.labels) ? card.labels : [], color: /^#[0-9a-f]{6}$/i.test(String(card.color || '')) ? card.color : '', customFields: normalizeCardCustomFields(customFields, card.customFields || {}), history: Array.isArray(card.history) ? card.history : [], comments: Array.isArray(card.comments) ? card.comments : [], attachments: Array.isArray(card.attachments) ? card.attachments : [], relatedCardIds: (Array.isArray(card.relatedCardIds) ? card.relatedCardIds : []).filter(cardId => cardId !== card.id && (existing?.cards || []).some(item => item.id === cardId)) }));
    return { id, name, description: String(value?.description ?? existing?.description ?? '').trim().slice(0, 1000), workflowId, workflowIds, columns, lanes, labels, customFields, cards, createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
  }
  async function createBoard(value) {
    return serializeMutation(files.boards, async () => {
      const boards = await readBoards(); const board = await validateBoard(value);
      if (boards.some(item => item.name.toLowerCase() === board.name.toLowerCase())) throw Object.assign(new Error('Já existe um quadro com esse nome.'), { status: 409 });
      boards.push(board); await writeJsonAtomic(files.boards, boards); logToConsole('success', `Quadro criado: ${board.name} · workflow ${board.workflowId}.`); return board;
    });
  }
  async function updateBoard(boardId, value) {
    return serializeMutation(files.boards, async () => {
      const boards = await readBoards(); const index = boards.findIndex(item => item.id === boardId);
      if (index < 0) throw Object.assign(new Error('Quadro não encontrado.'), { status: 404 });
      const board = await validateBoard(value, boardId, boards[index]);
      if (boards.some((item, position) => position !== index && item.name.toLowerCase() === board.name.toLowerCase())) throw Object.assign(new Error('Já existe um quadro com esse nome.'), { status: 409 });
      boards[index] = board; await writeJsonAtomic(files.boards, boards); logToConsole('info', `Configuração do quadro atualizada: ${board.name}.`); return board;
    });
  }
  async function createBoardCard(boardId, value) {
    return serializeMutation(files.boards, async () => {
      const boards = await readBoards(); const board = boards.find(item => item.id === boardId);
      if (!board) throw Object.assign(new Error('Quadro não encontrado.'), { status: 404 });
      const title = String(value?.title || '').trim();
      if (!title || title.length > 200) throw Object.assign(new Error('Informe o título do cartão com até 200 caracteres.'), { status: 400 });
      const workflowId = String(value.workflowId || board.workflowId);
      if (!(board.workflowIds || [board.workflowId]).includes(workflowId)) throw Object.assign(new Error('Escolha um workflow associado ao quadro.'), { status: 400 });
      const relatedCardIds = validateRelatedCards(board, null, value.relatedCardIds);
      const timestamp = new Date().toISOString();
      const card = { id: `card-${crypto.randomUUID()}`, title, description: String(value.description || '').trim().slice(0, 5000), columnId: board.columns.some(item => item.id === value.columnId) ? value.columnId : board.columns[0].id, laneId: board.lanes.some(item => item.id === value.laneId) ? value.laneId : board.lanes[0].id, priority: ['low', 'medium', 'high', 'urgent'].includes(value.priority) ? value.priority : 'medium', assignee: String(value.assignee || '').trim().slice(0, 120), labels: normalizeCardLabels(value.labels), dueDate: /^\d{4}-\d{2}-\d{2}$/.test(String(value.dueDate || '')) ? value.dueDate : '', color: /^#[0-9a-f]{6}$/i.test(String(value.color || '')) ? value.color : '', customFields: normalizeCardCustomFields(board.customFields || [], value.customFields || {}, {}, true), workflowId, relatedCardIds, attachments: [], comments: [], history: [], createdAt: timestamp, updatedAt: timestamp };
      appendCardHistory(card, 'created', 'Cartão criado.');
      for (const relatedId of relatedCardIds) { const other = board.cards.find(item => item.id === relatedId); other.relatedCardIds ||= []; other.relatedCardIds.push(card.id); appendCardHistory(other, 'relation', `Cartão relacionado: ${card.title}.`); other.updatedAt = timestamp; }
      board.cards.push(card); board.updatedAt = new Date().toISOString(); await writeJsonAtomic(files.boards, boards); logToConsole('info', `Cartão criado no quadro ${board.name}: ${card.title}.`); return card;
    });
  }
  async function updateBoardCard(boardId, cardId, value) {
    return serializeMutation(files.boards, async () => {
      const boards = await readBoards(); const board = boards.find(item => item.id === boardId); const card = board?.cards.find(item => item.id === cardId);
      if (!board || !card) throw Object.assign(new Error('Quadro ou cartão não encontrado.'), { status: 404 });
      const title = String(value.title ?? card.title).trim();
      if (!title || title.length > 200) throw Object.assign(new Error('Informe o título do cartão com até 200 caracteres.'), { status: 400 });
      const previous = { title: card.title, description: card.description, columnId: card.columnId, laneId: card.laneId, priority: card.priority, assignee: card.assignee, labels: card.labels, dueDate: card.dueDate, color: card.color || '', workflowId: card.workflowId || board.workflowId, customFields: card.customFields || {}, relatedCardIds: card.relatedCardIds || [] };
      const workflowId = String(value.workflowId ?? card.workflowId ?? board.workflowId);
      if (!(board.workflowIds || [board.workflowId]).includes(workflowId)) throw Object.assign(new Error('Escolha um workflow associado ao quadro.'), { status: 400 });
      const relatedCardIds = Object.hasOwn(value, 'relatedCardIds') ? validateRelatedCards(board, cardId, value.relatedCardIds) : previous.relatedCardIds;
      Object.assign(card, { title, description: String(value.description ?? card.description).trim().slice(0, 5000), columnId: board.columns.some(item => item.id === (value.columnId ?? card.columnId)) ? (value.columnId ?? card.columnId) : card.columnId, laneId: board.lanes.some(item => item.id === (value.laneId ?? card.laneId)) ? (value.laneId ?? card.laneId) : card.laneId, priority: ['low', 'medium', 'high', 'urgent'].includes(value.priority ?? card.priority) ? (value.priority ?? card.priority) : card.priority, assignee: String(value.assignee ?? card.assignee).trim().slice(0, 120), labels: Object.hasOwn(value, 'labels') ? normalizeCardLabels(value.labels) : card.labels || [], dueDate: value.dueDate === '' ? '' : /^\d{4}-\d{2}-\d{2}$/.test(String(value.dueDate ?? card.dueDate)) ? (value.dueDate ?? card.dueDate) : card.dueDate, color: value.color === '' ? '' : /^#[0-9a-f]{6}$/i.test(String(value.color ?? card.color ?? '')) ? (value.color ?? card.color ?? '') : card.color || '', workflowId, customFields: Object.hasOwn(value, 'customFields') ? normalizeCardCustomFields(board.customFields || [], value.customFields, card.customFields || {}, true) : normalizeCardCustomFields(board.customFields || [], card.customFields || {}), relatedCardIds, updatedAt: new Date().toISOString() });
      card.history ||= []; card.comments ||= []; card.attachments ||= [];
      if (JSON.stringify(previous.relatedCardIds) !== JSON.stringify(card.relatedCardIds)) {
        for (const other of board.cards) {
          if (other.id === card.id) continue;
          const wasRelated = previous.relatedCardIds.includes(other.id); const isRelated = card.relatedCardIds.includes(other.id);
          if (wasRelated === isRelated) continue;
          other.relatedCardIds ||= [];
          other.relatedCardIds = isRelated ? [...new Set([...other.relatedCardIds, card.id])] : other.relatedCardIds.filter(id => id !== card.id);
          other.updatedAt = card.updatedAt; appendCardHistory(other, 'relation', isRelated ? `Cartão relacionado: ${card.title}.` : `Relação removida com ${card.title}.`);
        }
      }
      const changed = Object.keys(previous).filter(key => JSON.stringify(previous[key]) !== JSON.stringify(card[key]));
      if (changed.length) {
        const descriptions = changed.filter(key => !['columnId', 'laneId'].includes(key)).map(key => ({ title: 'título', description: 'descrição', priority: 'prioridade', assignee: 'responsável', labels: 'etiquetas', dueDate: 'prazo', color: 'cor', workflowId: 'workflow', customFields: 'campos personalizados', relatedCardIds: 'cartões relacionados' }[key] || key));
        const fromColumn = board.columns.find(item => item.id === previous.columnId)?.name || previous.columnId; const toColumn = board.columns.find(item => item.id === card.columnId)?.name || card.columnId;
        const fromLane = board.lanes.find(item => item.id === previous.laneId)?.name || previous.laneId; const toLane = board.lanes.find(item => item.id === card.laneId)?.name || card.laneId;
        if (changed.includes('columnId') && changed.includes('laneId')) descriptions.unshift(`Movido de “${fromColumn} · ${fromLane}” para “${toColumn} · ${toLane}”`);
        else if (changed.includes('columnId')) descriptions.unshift(`Movido da coluna “${fromColumn}” para “${toColumn}”`);
        else if (changed.includes('laneId')) descriptions.unshift(`Movido da faixa “${fromLane}” para “${toLane}”`);
        appendCardHistory(card, changed.includes('columnId') || changed.includes('laneId') ? 'moved' : 'updated', descriptions.length ? `Atualizou ${descriptions.join(', ')}.` : 'Cartão atualizado.');
      }
      board.updatedAt = card.updatedAt; await writeJsonAtomic(files.boards, boards); return card;
    });
  }
  async function deleteBoardCard(boardId, cardId) {
    return serializeMutation(files.boards, async () => {
      const boards = await readBoards(); const board = boards.find(item => item.id === boardId);
      if (!board) throw Object.assign(new Error('Quadro não encontrado.'), { status: 404 });
      const removed = board.cards.find(item => item.id === cardId); const cards = board.cards.filter(item => item.id !== cardId); if (!removed) throw Object.assign(new Error('Cartão não encontrado.'), { status: 404 });
      for (const other of cards) if ((other.relatedCardIds || []).includes(cardId)) { other.relatedCardIds = other.relatedCardIds.filter(id => id !== cardId); appendCardHistory(other, 'updated', `Relação removida com o cartão ${removed.title}, excluído.`); }
      board.cards = cards; board.updatedAt = new Date().toISOString(); await writeJsonAtomic(files.boards, boards);
      for (const attachment of removed.attachments || []) await fs.rm(path.join(files.boardAttachments, attachment.id), { force: true });
      return { ok: true };
    });
  }
  function normalizeCardLabels(value) {
    if (value == null) return [];
    if (!Array.isArray(value)) throw Object.assign(new Error('Selecione etiquetas em uma lista válida.'), { status: 400 });
    const labels = [...new Set(value.map(item => String(item).trim()).filter(Boolean))];
    if (labels.length > 12 || labels.some(label => label.length > 80)) throw Object.assign(new Error('Selecione até 12 etiquetas com no máximo 80 caracteres.'), { status: 400 });
    return labels;
  }
  function validateRelatedCards(board, cardId, value) {
    if (value == null) return [];
    if (!Array.isArray(value) || value.length > 100) throw Object.assign(new Error('A lista de cartões relacionados é inválida.'), { status: 400 });
    const related = [...new Set(value.map(String))]; const available = new Set(board.cards.map(card => card.id));
    if (related.some(id => id === cardId || !available.has(id))) throw Object.assign(new Error('Relacione cartões existentes do mesmo quadro, exceto o próprio cartão.'), { status: 400 });
    return related;
  }
  async function addBoardCardComment(boardId, cardId, value) {
    return serializeMutation(files.boards, async () => {
      const boards = await readBoards(); const board = boards.find(item => item.id === boardId); const card = board?.cards.find(item => item.id === cardId);
      if (!card) throw Object.assign(new Error('Quadro ou cartão não encontrado.'), { status: 404 });
      const body = String(value?.body || '').trim();
      if (!body || body.length > 5000) throw Object.assign(new Error('Escreva um comentário de até 5.000 caracteres.'), { status: 400 });
      const comment = { id: `comment-${crypto.randomUUID()}`, author: String(value?.author || 'Você').trim().slice(0, 80) || 'Você', body, createdAt: new Date().toISOString() };
      card.comments ||= []; card.comments.push(comment); appendCardHistory(card, 'comment', `Comentário adicionado por ${comment.author}.`); card.updatedAt = comment.createdAt; board.updatedAt = comment.createdAt;
      await writeJsonAtomic(files.boards, boards); return comment;
    });
  }
  async function addBoardCardAttachment(boardId, cardId, value) {
    return serializeMutation(files.boards, async () => {
      const boards = await readBoards(); const board = boards.find(item => item.id === boardId); const card = board?.cards.find(item => item.id === cardId);
      if (!card) throw Object.assign(new Error('Quadro ou cartão não encontrado.'), { status: 404 });
      card.attachments ||= [];
      if (card.attachments.length >= 20) throw Object.assign(new Error('Cada cartão pode ter até 20 arquivos anexados.'), { status: 400 });
      const encoded = String(value?.data || ''); const buffer = Buffer.from(encoded, 'base64');
      if (!encoded || !buffer.length || buffer.length > MAX_BOARD_ATTACHMENT_BYTES || buffer.toString('base64').replace(/=+$/, '') !== encoded.replace(/=+$/, '')) throw Object.assign(new Error('O arquivo está vazio, inválido ou excede 1 MB.'), { status: 400 });
      const attachment = { id: `attachment-${crypto.randomUUID()}`, filename: safeAttachmentFilename(value.filename), mimeType: /^[\w.+-]+\/[\w.+-]+$/.test(String(value.mimeType || '')) ? String(value.mimeType) : 'application/octet-stream', size: buffer.length, createdAt: new Date().toISOString() };
      await fs.mkdir(files.boardAttachments, { recursive: true });
      const storedPath = path.join(files.boardAttachments, attachment.id);
      await fs.writeFile(storedPath, buffer, { flag: 'wx', mode: 0o600 });
      attachment.url = `/api/boards/${boardId}/cards/${cardId}/attachments/${attachment.id}`;
      card.attachments.push(attachment); appendCardHistory(card, 'attachment', `Arquivo anexado: ${attachment.filename}.`); card.updatedAt = attachment.createdAt; board.updatedAt = attachment.createdAt;
      try { await writeJsonAtomic(files.boards, boards); }
      catch (error) { await fs.rm(storedPath, { force: true }).catch(() => {}); throw error; }
      logToConsole('info', `Arquivo anexado ao cartão ${card.title}: ${attachment.filename}.`); return attachment;
    });
  }
  async function deleteBoardCardAttachment(boardId, cardId, attachmentId) {
    return serializeMutation(files.boards, async () => {
      const boards = await readBoards(); const board = boards.find(item => item.id === boardId); const card = board?.cards.find(item => item.id === cardId);
      if (!card) throw Object.assign(new Error('Quadro ou cartão não encontrado.'), { status: 404 });
      const attachment = (card.attachments || []).find(item => item.id === attachmentId);
      if (!attachment) throw Object.assign(new Error('Arquivo não encontrado neste cartão.'), { status: 404 });
      card.attachments = card.attachments.filter(item => item.id !== attachmentId); appendCardHistory(card, 'attachment', `Arquivo removido: ${attachment.filename}.`); card.updatedAt = new Date().toISOString(); board.updatedAt = card.updatedAt;
      await writeJsonAtomic(files.boards, boards); await fs.rm(path.join(files.boardAttachments, attachment.id), { force: true }); return { ok: true };
    });
  }
  function kanbanCardInput(board, card) {
    const labelNames = (card.labels || []).map(id => board.labels?.find(label => label.id === id)?.name || id);
    const fields = Object.entries(card.customFields || {}).filter(([, value]) => value !== '' && value != null && value !== false).map(([id, value]) => `${board.customFields?.find(field => field.id === id)?.name || id}: ${value}`);
    const related = (card.relatedCardIds || []).map(id => board.cards.find(item => item.id === id)).filter(Boolean).map(item => `${item.title}${item.description ? `: ${item.description}` : ''}`);
    return [card.title, card.description, labelNames.length ? `Etiquetas: ${labelNames.join(', ')}` : '', fields.length ? `Campos personalizados:\n${fields.join('\n')}` : '', related.length ? `Cartões relacionados:\n${related.join('\n')}` : ''].filter(Boolean).join('\n\n');
  }
  function validateAgent(value, id = value?.id || crypto.randomUUID()) {
    if (!value || typeof value !== 'object') throw Object.assign(new Error('Dados do agente inválidos.'), { status: 400 });
    const name = String(value.name || '').trim(); const runner = String(value.runner || 'codex').toLowerCase();
    if (!name || name.length > 120) throw Object.assign(new Error('Informe um nome de agente com até 120 caracteres.'), { status: 400 });
    if (!['codex', 'claude', 'opencode'].includes(runner)) throw Object.assign(new Error('Runner de agente inválido.'), { status: 400 });
    const model = String(value.model || (runner === 'claude' ? 'sonnet' : 'gpt-6-luna')).trim();
    const effort = String(value.effort || 'high'); const harness = String(value.harness || runner);
    const prompt = String(value.prompt || '').trim();
    if (!model || model.length > 120 || !['low', 'medium', 'high', 'xhigh', 'max'].includes(effort) || !['codex', 'claude', 'opencode'].includes(harness) || !prompt || prompt.length > 15_000) throw Object.assign(new Error('Revise modelo, esforço, harness e prompt do agente.'), { status: 400 });
    const datasetIds = validateDatasetIds(value.datasetIds == null ? [] : value.datasetIds, name);
    const skillIds = validateSkillIds(value.skillIds == null ? [] : value.skillIds, name);
    const credentialId = value.credentialId == null || value.credentialId === '' ? null : String(value.credentialId).slice(0, 100);
    return { id, name, runner, model, effort, harness, prompt, datasetIds, skillIds, credentialId };
  }
  async function appendLog(run, message, level = 'info') {
    const entry = addRunLog(run, message, level);
    const timer = persistTimers.get(run.id);
    if (timer) { clearTimeout(timer); persistTimers.delete(run.id); }
    await persistRun(run);
    return entry;
  }
  async function persistRun(run) {
    const queueKey = files.runs; const previous = persistQueues.get(queueKey) || Promise.resolve();
    const queued = previous.catch(() => {}).then(async () => {
      const runs = await loadJson(files.runs, []);
      const index = runs.findIndex(item => item.id === run.id);
      if (index < 0) runs.unshift(run); else runs[index] = run;
      await writeJsonAtomic(files.runs, runs.slice(0, 50));
    });
    persistQueues.set(queueKey, queued);
    try { await queued; }
    finally { if (persistQueues.get(queueKey) === queued) persistQueues.delete(queueKey); }
  }
  function appendOutputLog(run, message, level = 'output') {
    addRunLog(run, message, level);
    scheduleRunPersist(run);
  }
  function createOutputRecorder(run, stageName, runner = 'shell') {
    const buffers = { stdout: '', stderr: '' };
    function record(stream, line) {
      const clean = String(line).replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '').trim();
      if (!clean) return;
      const events = runner === 'shell' ? [{ level: stream === 'stderr' ? 'warning' : 'output', message: clean }] : summarizeRunnerLine(runner, clean);
      for (const event of events) {
        const level = stream === 'stderr' && ['output', 'info'].includes(event.level) ? 'warning' : event.level;
        appendOutputLog(run, `${stageName} · ${stream === 'stderr' ? 'stderr' : 'stdout'} · ${event.message}`, level);
      }
    }
    return {
      push(stream, value) {
        const chunk = String(value);
        run.outputTail = (run.outputTail + chunk).slice(-12_000);
        const combined = (buffers[stream] || '') + chunk;
        const lines = combined.split(/\r\n|\r|\n/);
        buffers[stream] = lines.pop() || '';
        lines.forEach(line => record(stream, line));
      },
      flush() {
        for (const stream of ['stdout', 'stderr']) { if (buffers[stream]) record(stream, buffers[stream]); buffers[stream] = ''; }
      }
    };
  }
  async function safeCredentialMetadata() {
    const records = await loadJson(files.credentials, []);
    return records.map(({ id, provider, label, createdAt }) => ({ id, provider, label, createdAt }));
  }
  async function getCredential(id, provider) {
    const records = await loadJson(files.credentials, []);
    const record = id ? records.find(item => item.id === id) : records.find(item => item.provider === provider);
    if (!record) return null;
    return parseCredential({ ...record.secret, key: (await getKey()).toString('base64') });
  }
  async function allDatasets() {
    await fs.mkdir(files.datasets, { recursive: true });
    const names = await fs.readdir(files.datasets);
    const result = [];
    for (const name of names.filter(item => item.endsWith('.json'))) {
      try { const { id, name: title, content, createdAt } = JSON.parse(await fs.readFile(path.join(files.datasets, name), 'utf8')); result.push({ id, name: title, chars: content.length, createdAt }); } catch { /* ignore partial data */ }
    }
    return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async function ensureDatasetReferences(ids) {
    for (const id of new Set(ids)) {
      try { await fs.access(path.join(files.datasets, `${id}.json`)); }
      catch (error) {
        if (error.code === 'ENOENT') throw Object.assign(new Error(`O dataset “${id}” não existe. Atualize a biblioteca e tente novamente.`), { status: 400 });
        throw error;
      }
    }
  }
  async function datasetContext(ids = []) {
    const sections = [];
    for (const id of ids) {
      if (!ID.test(String(id))) continue;
      try {
        const item = JSON.parse(await fs.readFile(path.join(files.datasets, `${id}.json`), 'utf8'));
        sections.push(`## Dataset: ${item.name}\n${item.content}`);
      } catch { throw new Error(`Dataset não encontrado: ${id}`); }
    }
    return sections.join('\n\n').slice(0, MAX_DATASET_CHARS);
  }
  async function probeRunners() {
    if (cliProbe) return cliProbe();
    const results = await Promise.all([detectRunner('codex', 'codex'), detectRunner('claude', 'claude'), detectRunner('opencode', 'opencode')]);
    try {
      const { stdout, stderr } = await execFileAsync('codex', ['login', 'status'], { env: { ...process.env, CODEX_HOME: process.env.CODEX_HOME || '/data/codex-home' }, timeout: 4000, windowsHide: true, maxBuffer: 32 * 1024 });
      const codex = results.find(item => item.id === 'codex');
      if (codex) codex.oauthAvailable = /logged in/i.test(`${stdout}\n${stderr}`);
    } catch { /* API-key credentials remain available even without a CLI OAuth session. */ }
    return results;
  }
  const frameworkChecks = {
    dotnet9: { command: 'dotnet', args: ['--list-sdks'], matches: output => output.split(/\r?\n/).find(line => /^9\./.test(line)) },
    dotnet10: { command: 'dotnet', args: ['--list-sdks'], matches: output => output.split(/\r?\n/).find(line => /^10\./.test(line)) },
    nodejs: { command: 'node', args: ['--version'], matches: output => output.match(/v?\d+\.\d+\.\d+/)?.[0] },
    python: { command: 'python3', args: ['--version'], matches: output => output.match(/Python\s+\d+(?:\.\d+)+/)?.[0] },
    rust: { command: 'rustc', args: ['--version'], matches: output => output.match(/rustc\s+\S+/)?.[0] },
    php: { command: 'php', args: ['--version'], matches: output => output.match(/PHP\s+\S+/)?.[0] },
    perl: { command: 'perl', args: ['-e', 'print $^V'], matches: output => output.match(/v?\d+(?:\.\d+)+/)?.[0] },
    cpp: { command: 'g++', args: ['--version'], matches: output => output.split(/\r?\n/)[0]?.trim() },
    go: { command: 'go', args: ['version'], matches: output => output.match(/go\d+(?:\.\d+)+/)?.[0] },
    java: { command: 'javac', args: ['-version'], matches: output => output.match(/javac\s+\S+/)?.[0] },
    ruby: { command: 'ruby', args: ['--version'], matches: output => output.match(/ruby\s+\S+/)?.[0] }
  };
  async function inspectFramework(id, executor = null) {
    const spec = runtimeFrameworks.find(item => item.id === id); const check = frameworkChecks[id];
    if (!spec || !check) throw new Error(`Framework desconhecido: ${id}`);
    try {
      let output;
      if (executor) output = (await executor(check.command, check.args)).output || '';
      else {
        const result = await execFileAsync(check.command, check.args, { timeout: 5000, windowsHide: true, maxBuffer: 128 * 1024 });
        output = `${result.stdout || ''}\n${result.stderr || ''}`;
      }
      const version = check.matches(output.trim());
      return { ...spec, installed: !!version, version: version || null };
    } catch (error) { return { ...spec, installed: false, version: null, error: error.code === 'ENOENT' ? 'Não instalado' : 'Verificação falhou' }; }
  }
  async function runtimeFrameworkStatus() { return Promise.all(runtimeFrameworks.map(item => inspectFramework(item.id))); }
  function kubectlArgs(settings, args) { return [...(settings.kubernetesContext ? ['--context', settings.kubernetesContext] : []), ...args]; }
  function kubectlEnvironment(settings) { return { ...process.env, ...(settings.kubernetesKubeconfigPath ? { KUBECONFIG: settings.kubernetesKubeconfigPath } : {}) }; }
  async function runKubectl(settings, args, options = {}) {
    return kubernetesExecutor('kubectl', kubectlArgs(settings, args), { env: kubectlEnvironment(settings), timeoutMs: options.timeoutMs || 30_000, signal: options.signal, input: options.input, onOutput: options.onOutput });
  }
  async function executeKubernetesWorker(context, command, args, options = {}) {
    if (!context.kubernetes?.podName) throw new Error('O worker Kubernetes ainda não está pronto.');
    const payload = JSON.stringify({ command, args, cwd: '/workspace', input: options.input || '', env: options.env || {} });
    return runKubectl(context.settings, ['exec', '-i', context.kubernetes.podName, '--', 'node', '/app/server/command-worker.js'], { input: payload, signal: options.signal, timeoutMs: options.timeoutMs, onOutput: options.onOutput });
  }
  async function prepareKubernetesWorker(context) {
    const settings = context.settings;
    if (!settings.kubernetesImage || !settings.kubernetesWorkspacePvc) throw new Error('Configure a imagem do worker e o PVC do workspace em Configurações antes de usar Kubernetes.');
    if (!settings.kubernetesKubeconfigPath && !process.env.KUBECONFIG) throw new Error('Kubeconfig não montado. Configure o caminho dentro do container em Configurações e monte esse arquivo como somente leitura.');
    const pvcResult = await runKubectl(settings, ['get', 'pvc', settings.kubernetesWorkspacePvc, '-n', settings.kubernetesNamespace, '-o', 'json']);
    let pvc;
    try { pvc = JSON.parse(pvcResult.output || '{}'); }
    catch { throw new Error(`O Kubernetes retornou dados inválidos para o PVC ${settings.kubernetesWorkspacePvc}.`); }
    if (pvc.status?.phase !== 'Bound') throw new Error(`O PVC ${settings.kubernetesWorkspacePvc} ainda não está vinculado (estado: ${pvc.status?.phase || 'desconhecido'}).`);
    const permissions = [['get', 'persistentvolumeclaims'], ['create', 'jobs'], ['get', 'jobs'], ['delete', 'jobs'], ['get', 'pods'], ['list', 'pods'], ['create', 'pods/exec']];
    let canReadCodexAuth = false;
    try { await fs.access(path.join(process.env.CODEX_HOME || '/run/codex', 'auth.json')); canReadCodexAuth = true; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (canReadCodexAuth) permissions.push(['create', 'secrets'], ['delete', 'secrets']);
    for (const [verb, resource] of permissions) {
      const access = await runKubectl(settings, ['auth', 'can-i', verb, resource, '-n', settings.kubernetesNamespace]);
      if (!/^yes$/i.test(String(access.output || '').trim())) throw new Error(`Acesso Kubernetes insuficiente: falta ${verb} em ${resource} no namespace ${settings.kubernetesNamespace}.`);
    }
    const runSuffix = context.run.id.replace(/[^a-z0-9]/gi, '').slice(0, 20).toLowerCase();
    const jobName = `openagents-${runSuffix}`;
    const authPath = path.join(process.env.CODEX_HOME || '/run/codex', 'auth.json');
    let authSecretName = null;
    try {
      const auth = await fs.readFile(authPath);
      authSecretName = `openagents-auth-${runSuffix}`;
      const secret = { apiVersion: 'v1', kind: 'Secret', metadata: { name: authSecretName, namespace: settings.kubernetesNamespace, labels: { 'app.kubernetes.io/managed-by': 'open-agents-sdlc', 'openagents.dev/run': runSuffix } }, type: 'Opaque', data: { 'auth.json': auth.toString('base64') } };
      await runKubectl(settings, ['apply', '-f', '-'], { input: JSON.stringify(secret) });
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error(`Não foi possível preparar a credencial temporária do worker Kubernetes: ${error.message}`);
    }
    const frameworks = context.execution.frameworks;
    const container = {
      name: 'workflow-runner', image: settings.kubernetesImage, imagePullPolicy: 'IfNotPresent',
      command: ['/bin/sh', '-lc', 'while :; do sleep 3600; done'], workingDir: '/workspace',
      env: [
        { name: 'CODEX_HOME', value: '/run/codex' },
        { name: 'OPENCODE_DISABLE_AUTOUPDATE', value: '1' },
        { name: 'DOTNET_NOLOGO', value: '1' },
        { name: 'OPEN_AGENTS_FRAMEWORKS', value: frameworks.join(',') }
      ],
      volumeMounts: [{ name: 'workspace', mountPath: '/workspace', ...(settings.kubernetesWorkspaceSubPath ? { subPath: settings.kubernetesWorkspaceSubPath } : {}) }]
    };
    const volumes = [{ name: 'workspace', persistentVolumeClaim: { claimName: settings.kubernetesWorkspacePvc } }];
    if (authSecretName) {
      volumes.push({ name: 'codex-auth', secret: { secretName: authSecretName, defaultMode: 288 } });
      container.volumeMounts.push({ name: 'codex-auth', mountPath: '/run/codex', readOnly: true });
    }
    const job = {
      apiVersion: 'batch/v1', kind: 'Job',
      metadata: { name: jobName, namespace: settings.kubernetesNamespace, labels: { 'app.kubernetes.io/name': 'open-agents-sdlc', 'app.kubernetes.io/managed-by': 'open-agents-sdlc', 'openagents.dev/run': runSuffix }, annotations: { 'openagents.dev/frameworks': frameworks.join(',') } },
      spec: { backoffLimit: 0, activeDeadlineSeconds: 86_400, template: { metadata: { labels: { 'app.kubernetes.io/name': 'open-agents-sdlc', 'openagents.dev/run': runSuffix } }, spec: { restartPolicy: 'Never', automountServiceAccountToken: false, securityContext: { runAsUser: 1000, runAsGroup: 1000, fsGroup: 1000 }, containers: [container], volumes } } }
    };
    context.kubernetes = { jobName, authSecretName, podName: null };
    await appendLog(context.run, `Preparando Job Kubernetes · ${settings.kubernetesNamespace}/${jobName} · ${frameworks.length} frameworks.`);
    await runKubectl(settings, ['apply', '-f', '-'], { input: JSON.stringify(job), signal: context.signal });
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      if (context.signal.aborted) throw new Error('Execução cancelada enquanto o worker Kubernetes iniciava.');
      const listed = await runKubectl(settings, ['get', 'pods', '-n', settings.kubernetesNamespace, '-l', `job-name=${jobName}`, '-o', 'json'], { signal: context.signal, timeoutMs: 15_000 });
      let pods;
      try { pods = JSON.parse(listed.output || '{}').items || []; } catch { pods = []; }
      const pod = pods[0];
      if (pod) {
        const phase = pod.status?.phase;
        if (phase === 'Failed') throw new Error(`O pod ${pod.metadata?.name || jobName} falhou ao iniciar. Verifique a imagem e o PVC Kubernetes.`);
        if (pod.status?.conditions?.some(item => item.type === 'Ready' && item.status === 'True')) { context.kubernetes.podName = pod.metadata.name; break; }
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (!context.kubernetes.podName) throw new Error(`Tempo esgotado aguardando o worker Kubernetes (${jobName}). Verifique a imagem, o namespace e o PVC.`);
    await appendLog(context.run, `Worker Kubernetes pronto · pod ${context.kubernetes.podName}.`);
    for (const id of frameworks) {
      const check = frameworkChecks[id];
      await appendLog(context.run, `Verificando ${runtimeFrameworks.find(item => item.id === id)?.name || id} no worker Kubernetes.`);
      const result = await executeKubernetesWorker(context, check.command, check.args, { signal: context.signal, timeoutMs: 15_000 });
      const status = await inspectFramework(id, async () => result);
      if (!status.installed) throw new Error(`${status.name} não está disponível na imagem Kubernetes ${settings.kubernetesImage}.`);
      await appendLog(context.run, `${status.name} disponível no worker · ${status.version}.`, 'success');
    }
  }
  async function cleanupKubernetesWorker(context) {
    const worker = context.kubernetes; if (!worker) return;
    try { await runKubectl(context.settings, ['delete', 'job', worker.jobName, '-n', context.settings.kubernetesNamespace, '--ignore-not-found=true', '--wait=false'], { timeoutMs: 15_000 }); }
    catch (error) { logToConsole('warning', `Não foi possível remover o Job ${worker.jobName}: ${error.message}`, context.run); }
    if (worker.authSecretName) {
      try { await runKubectl(context.settings, ['delete', 'secret', worker.authSecretName, '-n', context.settings.kubernetesNamespace, '--ignore-not-found=true'], { timeoutMs: 15_000 }); }
      catch (error) { logToConsole('warning', `Não foi possível remover o Secret temporário do Job ${worker.jobName}: ${error.message}`, context.run); }
    }
  }
  async function executeWorkflowCommand(context, command, args, options = {}) {
    if (context.execution.target === 'kubernetes') return executeKubernetesWorker(context, command, args, options);
    return commandExecutor(command, args, { cwd: executionPath, env: options.env, input: options.input, signal: options.signal, timeoutMs: options.timeoutMs, onOutput: options.onOutput });
  }
  async function invokeAgent(node, context) {
    const { input, previous, run, signal, settings } = context;
    const config = node.config || {};
    const runner = String(config.runner || settings.defaultRunner || 'codex').toLowerCase();
    const model = String(config.model || settings.defaultModel || (runner === 'claude' ? 'sonnet' : 'gpt-6-luna')).trim();
    const effort = ['low', 'medium', 'high', 'xhigh', 'max'].includes(String(config.effort || settings.defaultEffort).toLowerCase()) ? String(config.effort || settings.defaultEffort).toLowerCase() : 'high';
    const secret = await getCredential(config.credentialId, runner === 'claude' ? 'anthropic' : 'openai');
    const env = { ...process.env, CODEX_HOME: process.env.CODEX_HOME || '/data/codex-home', OPENCODE_DISABLE_AUTOUPDATE: '1', OPEN_AGENTS_FRAMEWORKS: context.execution.frameworks.join(',') };
    if (secret) env[runner === 'claude' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'] = secret;
    const ds = await datasetContext(config.datasetIds || []);
    const skills = await skillContext(config.skillIds || []);
    const runtimeNames = context.execution.frameworks.map(id => runtimeFrameworks.find(item => item.id === id)?.name).filter(Boolean);
    const mcpContext = context.execution.target === 'container' ? 'SERVIDOR MCP DO OPEN AGENTS SDLC:\nEndpoint HTTP local: http://127.0.0.1:8080/mcp. Para descobrir recursos, envie POST server/discover e depois tools/list. Ferramentas Kanban: kanban_list_boards, kanban_get_board, kanban_create_board, kanban_update_board, kanban_create_card, kanban_move_card, kanban_update_card, kanban_delete_card, kanban_add_comment, kanban_link_cards, kanban_run_card. Use curl quando a solicitação exigir consultar ou alterar quadros/cartões. Envie Accept: application/json, text/event-stream; Content-Type: application/json; MCP-Protocol-Version: 2026-07-28; Mcp-Method igual ao method JSON-RPC e, em tools/call, Mcp-Name igual a params.name. Inclua params._meta em cada chamada com io.modelcontextprotocol/protocolVersion (2026-07-28), io.modelcontextprotocol/clientInfo e io.modelcontextprotocol/clientCapabilities.' : '';
    const prompt = [config.prompt, `AMBIENTE DO WORKFLOW:\nExecução em ${context.execution.target === 'kubernetes' ? `Kubernetes (${settings.kubernetesNamespace})` : 'container Docker local'}.${runtimeNames.length ? ` Toolchains disponíveis: ${runtimeNames.join(', ')}.` : ''}`, mcpContext, `SOLICITAÇÃO DO WORKFLOW:\n${input}`, previous ? `RESULTADO DA ETAPA ANTERIOR:\n${previous}` : '', ds ? `CONTEXTO DOS DATASETS:\n${ds}` : '', skills ? `SKILLS APLICADAS:\n${skills}` : ''].filter(Boolean).join('\n\n');
    let command; let args;
    if (runner === 'codex') {
      command = 'codex';
      args = ['exec', '--cd', context.execution.target === 'kubernetes' ? '/workspace' : executionPath, '--model', model, '--dangerously-bypass-approvals-and-sandbox', '-c', `model_reasoning_effort="${effort}"`, '--json', '-'];
    } else if (runner === 'opencode') {
      command = 'opencode';
      const fullModel = model.includes('/') ? model : `openai/${model}`;
      args = ['run', '--format', 'json', '--dir', context.execution.target === 'kubernetes' ? '/workspace' : executionPath, '--model', fullModel, '--variant', effort, prompt];
    } else if (runner === 'claude') {
      command = 'claude';
      args = ['-p', '--output-format', 'json', '--model', model, '--max-turns', '20', '--dangerously-skip-permissions', prompt];
    } else throw new Error(`Runner não reconhecido: ${runner}`);
    await appendLog(run, `${node.name}: iniciando ${command} · ${model} · esforço ${effort}.`);
    const recorder = createOutputRecorder(run, node.name, runner);
    let result;
    try {
      result = await executeWorkflowCommand(context, command, args, {
        env: context.execution.target === 'kubernetes' ? { CODEX_HOME: '/run/codex', OPENCODE_DISABLE_AUTOUPDATE: '1', ...(secret ? { [runner === 'claude' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY']: secret } : {}) } : env,
        input: runner === 'codex' ? prompt : undefined, signal, timeoutMs: settings.agentTimeoutMinutes * 60_000,
        onOutput: (stream, text) => recorder.push(stream, text)
      });
    } finally { recorder.flush(); }
    const response = extractRunnerResponse(runner, result.output, result.stderr) || 'Etapa concluída sem resposta textual.';
    await appendLog(run, `${node.name}: runner concluiu com sucesso.`);
    return response.slice(-30_000);
  }
  async function executeGraph(nodes, edges, context) {
    const ordered = sortNodes(nodes, edges);
    let previous = context.previous || '';
    for (const node of ordered) {
      if (context.signal.aborted) throw new Error('Execução cancelada pelo usuário.');
      const step = { nodeId: node.id, name: node.name, type: node.type, graphPath: context.graphPath || [], status: 'running', startedAt: new Date().toISOString(), output: '' };
      context.run.steps.push(step);
      await appendLog(context.run, `Etapa iniciada: ${node.name}.`);
      try {
        if (node.type === 'trigger') step.output = context.input;
        else if (node.type === 'agent') step.output = await context.agentExecutor(node, { ...context, previous });
        else if (node.type === 'subworkflow') {
          const children = node.children || [];
          const childEdges = node.childEdges || children.slice(1).map((child, index) => [children[index].id, child.id]);
          step.output = await executeGraph(children, childEdges, { ...context, previous, graphPath: [...(context.graphPath || []), node.id] });
        }
        else if (node.type === 'condition') {
          const expression = String(node.config?.contains || '').trim();
          step.output = !expression || previous.toLowerCase().includes(expression.toLowerCase()) ? 'Condição aprovada.' : 'Condição não atendida.';
          if (expression && step.output === 'Condição não atendida.') throw new Error(`Condição não atendida: ${expression}`);
        } else if (node.type === 'approval') {
          context.run.status = 'waiting_approval';
          context.run.pendingApproval = { nodeId: node.id, name: node.name, message: node.config?.message || 'Aprovar a continuação?' };
          await appendLog(context.run, `Aguardando aprovação humana: ${node.name}.`);
          const decision = await new Promise(resolve => {
            context.pendingDecision = resolve;
            context.signal.addEventListener('abort', () => resolve('cancel'), { once: true });
          });
          context.pendingDecision = null;
          context.run.pendingApproval = null;
          if (decision !== 'approve') throw new Error(decision === 'reject' ? 'Execução rejeitada na etapa de aprovação.' : 'Execução cancelada enquanto aguardava aprovação.');
          context.run.status = 'running';
          step.output = 'Aprovado por uma pessoa.';
          await appendLog(context.run, `Aprovação concedida: ${node.name}.`);
        } else if (node.type === 'integration') {
          if (node.config?.requiresApproval && !context.run.steps.some(item => item.type === 'approval' && item.status === 'completed')) throw new Error('Esta integração exige uma etapa de aprovação humana concluída antes de executar.');
          const command = String(node.config?.command || '').trim();
          if (!command) throw new Error('Configure o comando desta integração.');
          await appendLog(context.run, `Executando integração no workspace: ${command}`);
          const recorder = createOutputRecorder(context.run, node.name, 'shell');
          let result;
          try { result = await executeWorkflowCommand(context, 'sh', ['-lc', command], { env: context.execution.target === 'kubernetes' ? {} : process.env, timeoutMs: context.settings.integrationTimeoutMinutes * 60_000, signal: context.signal, onOutput: (stream, text) => recorder.push(stream, text) }); }
          finally { recorder.flush(); }
          step.output = result.output || 'Comando de integração concluído.';
          await appendLog(context.run, `${node.name}: integração concluída · código ${result.exitCode ?? 0}.`, 'success');
        }
        step.status = 'completed'; step.finishedAt = new Date().toISOString();
        previous = step.output || previous;
        await persistRun(context.run);
      } catch (error) {
        step.status = 'failed'; step.error = error.message; step.finishedAt = new Date().toISOString();
        await appendLog(context.run, `${node.name}: ${error.message}`, 'error');
        throw error;
      }
    }
    return previous;
  }
  async function executeRun(run, workflow, input) {
    const controller = new AbortController();
    const context = { run, input, settings: null, execution: null, kubernetes: null, previous: '', graphPath: [], signal: controller.signal, pendingDecision: null, agentExecutor: invokeAgent, commandExecutor };
    activeRuns.set(run.id, { controller, context });
    try {
      context.settings = await readSettings();
      context.execution = { target: workflow.execution?.target || context.settings.defaultExecutionTarget, frameworks: workflow.execution?.frameworks || [] };
      run.execution = structuredClone(context.execution);
      run.status = 'running';
      const selectedFrameworks = context.execution.frameworks.map(id => runtimeFrameworks.find(item => item.id === id)?.name).filter(Boolean);
      await appendLog(run, `Execução iniciada · ${workflow.name} · ambiente ${context.execution.target === 'kubernetes' ? `Kubernetes/${context.settings.kubernetesNamespace}` : 'container Docker'}${selectedFrameworks.length ? ` · frameworks ${selectedFrameworks.join(', ')}` : ''}.`);
      if (context.execution.target === 'kubernetes') await prepareKubernetesWorker(context);
      else {
        for (const id of context.execution.frameworks) {
          await appendLog(run, `Verificando ${runtimeFrameworks.find(item => item.id === id)?.name || id} no container.`);
          const available = await inspectFramework(id);
          if (!available.installed) throw new Error(`${available.name} não está instalado no container atual. Atualize a imagem do Open Agents SDLC e tente novamente.`);
          await appendLog(run, `${available.name} disponível no container · ${available.version}.`, 'success');
        }
      }
      await executeGraph(workflow.nodes, workflow.edges, context);
      run.status = 'completed'; run.finishedAt = new Date().toISOString();
      await appendLog(run, 'Workflow concluído.');
    } catch (error) {
      run.status = controller.signal.aborted ? 'cancelled' : 'failed'; run.error = error.message; run.finishedAt = new Date().toISOString();
      await appendLog(run, error.message, 'error');
    } finally {
      await cleanupKubernetesWorker(context);
      run.output = context.run.steps.filter(step => step.status === 'completed').at(-1)?.output || '';
      activeRuns.delete(run.id); await persistRun(run);
    }
  }
  function launchExecution(item) {
    activeExecutionCount++;
    void executeRun(item.run, item.workflow, item.input)
      .catch(error => logToConsole('error', `Falha interna na execução ${item.run.id}: ${redactSecrets(error.message)}.`))
      .finally(() => {
        activeExecutionCount--;
        void drainExecutionQueue().catch(error => logToConsole('error', `Falha ao liberar a fila de execuções: ${redactSecrets(error.message)}.`));
      });
  }
  async function drainExecutionQueue() {
    const settings = await readSettings();
    while (executionQueue.length && activeExecutionCount < settings.maxConcurrentRuns) launchExecution(executionQueue.shift());
  }
  async function enqueueExecution(run, workflow, input) {
    const settings = await readSettings(); const item = { run, workflow, input };
    if (activeExecutionCount < settings.maxConcurrentRuns) launchExecution(item);
    else { executionQueue.push(item); await appendLog(run, `Execução na fila · limite de ${settings.maxConcurrentRuns} execuções simultâneas.`); }
  }
  const mcpToolNames = ['kanban_list_boards', 'kanban_get_board', 'kanban_create_board', 'kanban_update_board', 'kanban_create_card', 'kanban_move_card', 'kanban_update_card', 'kanban_delete_card', 'kanban_add_comment', 'kanban_link_cards', 'kanban_run_card'];
  const boardLayoutItemSchema = z.union([
    z.string().trim().min(1).max(80),
    z.object({ id: z.string().regex(ID).optional(), name: z.string().trim().min(1).max(80), color: z.string().regex(/^#[0-9a-f]{6}$/i).optional() }).strict()
  ]);
  const boardLayoutSchema = z.array(boardLayoutItemSchema).min(1).max(20);
  const idSchema = z.string().min(1).max(80);
  const labelSchema = z.array(z.string().trim().min(1).max(80)).max(12);
  function createKanbanMcpServer() {
    const mcpServer = new McpServer({ name: 'open-agents-sdlc-kanban', version: '1.1.0', instructions: 'Gerencie quadros Kanban ligados a um ou mais workflows. Cartões têm histórico, comentários, etiquetas e relações. Leia o quadro antes de mover ou executar cartões.' });
    function register(name, description, inputSchema, action) {
      mcpServer.registerTool(name, { description, inputSchema }, async args => {
        try {
          const result = await action(args);
          logToConsole('info', `MCP ${name} concluído.`);
          return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
        } catch (error) {
          logToConsole('warning', `MCP ${name}: ${error.message}`);
          return { content: [{ type: 'text', text: error.message }], isError: true };
        }
      });
    }
    register('kanban_list_boards', 'Lista quadros Kanban, workflows, colunas, faixas e cartões.', z.object({}).strict(), async () => readBoards());
    register('kanban_get_board', 'Lê um quadro, suas colunas, faixas e cartões.', z.object({ boardId: idSchema }).strict(), async ({ boardId }) => {
      const board = (await readBoards()).find(item => item.id === boardId);
      if (!board) throw Object.assign(new Error('Quadro não encontrado.'), { status: 404 });
      return board;
    });
    register('kanban_create_board', 'Cria um quadro ligado a um ou mais workflows, com colunas, faixas, etiquetas e campos personalizados.', z.object({ name: z.string().trim().min(1).max(120), workflowId: idSchema, workflowIds: z.array(idSchema).max(20).optional(), description: z.string().max(1000).optional(), columns: boardLayoutSchema.optional(), lanes: boardLayoutSchema.optional(), labels: z.array(z.object({ id: idSchema.optional(), name: z.string().trim().min(1).max(50), color: z.string().regex(/^#[0-9a-f]{6}$/i).optional() })).max(50).optional(), customFields: z.array(z.object({ id: idSchema.optional(), name: z.string().trim().min(1).max(80), type: z.enum(['text', 'number', 'date', 'select', 'checkbox']), options: z.array(z.string().max(80)).max(30).optional(), required: z.boolean().optional() })).max(30).optional() }).strict(), async args => createBoard(args));
    register('kanban_update_board', 'Personaliza workflows, colunas, faixas, etiquetas e campos de um quadro.', z.object({ boardId: idSchema, name: z.string().trim().min(1).max(120).optional(), workflowId: idSchema.optional(), workflowIds: z.array(idSchema).max(20).optional(), description: z.string().max(1000).optional(), columns: boardLayoutSchema.optional(), lanes: boardLayoutSchema.optional(), labels: z.array(z.object({ id: idSchema.optional(), name: z.string().trim().min(1).max(50), color: z.string().regex(/^#[0-9a-f]{6}$/i).optional() })).max(50).optional(), customFields: z.array(z.object({ id: idSchema.optional(), name: z.string().trim().min(1).max(80), type: z.enum(['text', 'number', 'date', 'select', 'checkbox']), options: z.array(z.string().max(80)).max(30).optional(), required: z.boolean().optional() })).max(30).optional() }).strict(), async ({ boardId, ...value }) => updateBoard(boardId, value));
    register('kanban_create_card', 'Cria um cartão em um dos workflows do quadro, com etiquetas e campos personalizados.', z.object({ boardId: idSchema, title: z.string().trim().min(1).max(200), description: z.string().max(5000).optional(), columnId: idSchema.optional(), laneId: idSchema.optional(), workflowId: idSchema.optional(), priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(), assignee: z.string().max(120).optional(), labels: labelSchema.optional(), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(), customFields: z.record(z.string(), z.unknown()).optional(), relatedCardIds: z.array(idSchema).max(100).optional() }).strict(), async ({ boardId, ...card }) => createBoardCard(boardId, card));
    register('kanban_move_card', 'Move um cartão para uma coluna e/ou faixa do mesmo quadro.', z.object({ boardId: idSchema, cardId: idSchema, columnId: idSchema.optional(), laneId: idSchema.optional() }).strict(), async ({ boardId, cardId, ...position }) => updateBoardCard(boardId, cardId, position));
    register('kanban_update_card', 'Atualiza título, descrição, cor, workflow, campos, etiquetas ou prazo do cartão.', z.object({ boardId: idSchema, cardId: idSchema, title: z.string().trim().min(1).max(200).optional(), description: z.string().max(5000).optional(), workflowId: idSchema.optional(), priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(), assignee: z.string().max(120).optional(), labels: labelSchema.optional(), dueDate: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(), color: z.union([z.literal(''), z.string().regex(/^#[0-9a-f]{6}$/i)]).optional(), customFields: z.record(z.string(), z.unknown()).optional(), relatedCardIds: z.array(idSchema).max(100).optional() }).strict(), async ({ boardId, cardId, ...value }) => updateBoardCard(boardId, cardId, value));
    register('kanban_delete_card', 'Remove um cartão de um quadro.', z.object({ boardId: idSchema, cardId: idSchema }).strict(), async ({ boardId, cardId }) => deleteBoardCard(boardId, cardId));
    register('kanban_add_comment', 'Adiciona um comentário ao histórico do cartão.', z.object({ boardId: idSchema, cardId: idSchema, body: z.string().trim().min(1).max(5000), author: z.string().max(80).optional() }).strict(), async ({ boardId, cardId, ...comment }) => addBoardCardComment(boardId, cardId, comment));
    register('kanban_link_cards', 'Define os cartões do mesmo quadro relacionados ao cartão selecionado.', z.object({ boardId: idSchema, cardId: idSchema, relatedCardIds: z.array(idSchema).max(100) }).strict(), async ({ boardId, cardId, relatedCardIds }) => updateBoardCard(boardId, cardId, { relatedCardIds }));
    register('kanban_run_card', 'Executa o workflow associado usando o título e a descrição do cartão como solicitação.', z.object({ boardId: idSchema, cardId: idSchema }).strict(), async ({ boardId, cardId }) => {
      const board = (await readBoards()).find(item => item.id === boardId); const card = board?.cards.find(item => item.id === cardId);
      if (!board || !card) throw Object.assign(new Error('Quadro ou cartão não encontrado.'), { status: 404 });
      const workflowId = (board.workflowIds || [board.workflowId]).includes(card.workflowId) ? card.workflowId : board.workflowId;
      const workflow = await readWorkflow(workflowId); const input = kanbanCardInput(board, card);
      const run = { id: crypto.randomUUID(), workflowId: workflow.id, workflowName: workflow.name, status: 'queued', input, createdAt: new Date().toISOString(), steps: [], log: [], outputTail: '' };
      await persistRun(run); await enqueueExecution(run, workflow, input); return { id: run.id, status: run.status, workflowId: workflow.id };
    });
    return mcpServer;
  }
  const mcpHandler = createMcpHandler(createKanbanMcpServer, { responseMode: 'auto', legacy: 'stateless' });
  const mcpNodeHandler = toNodeHandler(mcpHandler);
  const validateMcpHost = localhostHostValidation();
  const validateMcpOrigin = localhostOriginValidation();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const route = url.pathname;
    try {
      if (route.startsWith('/api/')) {
        if (req.method === 'GET' && route === '/api/health') return json(res, 200, { ok: true, name: 'Open Agents SDLC', workspace: executionPath });
        if (req.method === 'GET' && route === '/api/settings') return json(res, 200, await readSettings());
        if (req.method === 'PUT' && route === '/api/settings') return json(res, 200, await writeSettings(await readBody(req)));
        if (req.method === 'GET' && route === '/api/boards') return json(res, 200, await readBoards());
        if (req.method === 'POST' && route === '/api/boards') return json(res, 201, await createBoard(await readBody(req)));
        const cardCommentsRoute = route.match(/^\/api\/boards\/([a-zA-Z0-9_-]+)\/cards\/([a-zA-Z0-9_-]+)\/comments$/);
        if (req.method === 'POST' && cardCommentsRoute) return json(res, 201, await addBoardCardComment(cardCommentsRoute[1], cardCommentsRoute[2], await readBody(req)));
        const cardAttachmentsRoute = route.match(/^\/api\/boards\/([a-zA-Z0-9_-]+)\/cards\/([a-zA-Z0-9_-]+)\/attachments(?:\/([a-zA-Z0-9_-]+))?$/);
        if (cardAttachmentsRoute) {
          const [, boardId, cardId, attachmentId] = cardAttachmentsRoute;
          if (req.method === 'POST' && !attachmentId) return json(res, 201, await addBoardCardAttachment(boardId, cardId, await readBody(req)));
          if (req.method === 'DELETE' && attachmentId) return json(res, 200, await deleteBoardCardAttachment(boardId, cardId, attachmentId));
          if (req.method === 'GET' && attachmentId) {
            const board = (await readBoards()).find(item => item.id === boardId); const card = board?.cards.find(item => item.id === cardId); const attachment = card?.attachments?.find(item => item.id === attachmentId);
            if (!attachment) throw Object.assign(new Error('Arquivo não encontrado neste cartão.'), { status: 404 });
            const data = await fs.readFile(path.join(files.boardAttachments, attachment.id));
            res.writeHead(200, { 'content-type': attachment.mimeType || 'application/octet-stream', 'content-length': data.length, 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`, 'x-content-type-options': 'nosniff', 'cache-control': 'private, no-store' });
            return res.end(data);
          }
        }
        const boardCardRoute = route.match(/^\/api\/boards\/([a-zA-Z0-9_-]+)\/cards(?:\/([a-zA-Z0-9_-]+))?(?:\/(run))?$/);
        if (boardCardRoute) {
          const [, boardId, cardId, action] = boardCardRoute;
          if (req.method === 'POST' && !cardId) return json(res, 201, await createBoardCard(boardId, await readBody(req)));
          if (req.method === 'PUT' && cardId && !action) return json(res, 200, await updateBoardCard(boardId, cardId, await readBody(req)));
          if (req.method === 'DELETE' && cardId && !action) return json(res, 200, await deleteBoardCard(boardId, cardId));
          if (req.method === 'POST' && cardId && action === 'run') { const board = (await readBoards()).find(item => item.id === boardId); const card = board?.cards.find(item => item.id === cardId); if (!board || !card) throw Object.assign(new Error('Quadro ou cartão não encontrado.'), { status: 404 }); const workflowId = (board.workflowIds || [board.workflowId]).includes(card.workflowId) ? card.workflowId : board.workflowId; const workflow = await readWorkflow(workflowId); const input = kanbanCardInput(board, card); const run = { id: crypto.randomUUID(), workflowId: workflow.id, workflowName: workflow.name, status: 'queued', input, createdAt: new Date().toISOString(), steps: [], log: [], outputTail: '' }; await persistRun(run); await enqueueExecution(run, workflow, input); return json(res, 202, { id: run.id, status: run.status, workflowId: workflow.id }); }
        }
        const boardRoute = route.match(/^\/api\/boards\/([a-zA-Z0-9_-]+)$/);
        if (boardRoute) {
          const [, boardId] = boardRoute;
          if (req.method === 'GET') { const board = (await readBoards()).find(item => item.id === boardId); if (!board) throw Object.assign(new Error('Quadro não encontrado.'), { status: 404 }); return json(res, 200, board); }
          if (req.method === 'PUT') return json(res, 200, await updateBoard(boardId, await readBody(req)));
          if (req.method === 'DELETE') return json(res, 200, await serializeMutation(files.boards, async () => {
            const boards = await readBoards(); const board = boards.find(item => item.id === boardId);
            if (!board) throw Object.assign(new Error('Quadro não encontrado.'), { status: 404 });
            await writeJsonAtomic(files.boards, boards.filter(item => item.id !== boardId));
            for (const card of board.cards || []) for (const attachment of card.attachments || []) await fs.rm(path.join(files.boardAttachments, attachment.id), { force: true });
            logToConsole('warning', `Quadro removido: ${boardId}.`); return { ok: true };
          }));
        }
        if (req.method === 'GET' && route === '/api/workflows') {
          const storage = await ensureWorkflowStorage();
          return json(res, 200, { activeWorkflowId: storage.activeId, workflows: storage.workflows.map(workflow => ({ id: workflow.id, name: workflow.name, nodeCount: workflow.nodes.length, updatedAt: workflow.updatedAt || null })) });
        }
        if (req.method === 'GET' && route === '/api/workflow-templates') {
          return json(res, 200, workflowTemplates.map(({ id, name, description, build }) => ({ id, name, description, stageCount: build().nodes.length, isDefault: id === 'sdlc-standard' })));
        }
        if (req.method === 'POST' && route === '/api/workflows') {
          const body = await readBody(req); const name = String(body.name || '').trim();
          if (!name || name.length > 120) throw Object.assign(new Error('Informe um nome de workflow com até 120 caracteres.'), { status: 400 });
          const workflow = await serializeMutation(files.workflows, async () => {
            const storage = await ensureWorkflowStorage();
            if (storage.workflows.some(item => item.name.toLowerCase() === name.toLowerCase())) throw Object.assign(new Error('Já existe um workflow com esse nome.'), { status: 409 });
            const templateId = String(body.templateId || 'sdlc-standard');
            const template = workflowTemplates.find(item => item.id === templateId);
            if (!template) throw Object.assign(new Error('Escolha um template de workflow válido.'), { status: 400 });
            const workflowId = `workflow-${crypto.randomUUID()}`; const settings = await readSettings();
            const created = validateWorkflow({ ...template.build(), id: workflowId, name, updatedAt: new Date().toISOString(), execution: { target: settings.defaultExecutionTarget, frameworks: [] } });
            const applyDefaults = nodes => {
              for (const node of nodes) {
                if (node.type === 'agent') Object.assign(node.config, { runner: settings.defaultRunner, model: settings.defaultModel, effort: settings.defaultEffort, harness: settings.defaultRunner });
                if (node.type === 'subworkflow') applyDefaults(node.children || []);
              }
            };
            applyDefaults(created.nodes);
            const boardId = String(body.boardId || '').trim(); const priorWorkflows = structuredClone(storage.workflows); const priorActive = storage.activeId;
            const saveWorkflow = async () => {
              storage.workflows.push(created); storage.activeId = workflowId;
              try { await writeJsonAtomic(files.workflows, storage.workflows); await writeJsonAtomic(files.activeWorkflow, workflowId); }
              catch (error) { storage.workflows = priorWorkflows; storage.activeId = priorActive; await writeJsonAtomic(files.workflows, priorWorkflows).catch(() => {}); await writeJsonAtomic(files.activeWorkflow, priorActive).catch(() => {}); throw error; }
              return created;
            };
            if (!boardId) return saveWorkflow();
            return serializeMutation(files.boards, async () => {
              const boards = await readBoards(); const board = boards.find(item => item.id === boardId);
              if (!board) throw Object.assign(new Error('O quadro selecionado não existe mais. Atualize a lista e tente novamente.'), { status: 404 });
              const previousBoards = structuredClone(boards); board.workflowId = workflowId; board.workflowIds = [...new Set([workflowId, ...(board.workflowIds || [workflowId])])]; board.updatedAt = new Date().toISOString();
              await writeJsonAtomic(files.boards, boards);
              try { return await saveWorkflow(); }
              catch (error) { await writeJsonAtomic(files.boards, previousBoards).catch(() => {}); throw error; }
            });
          });
          logToConsole('success', `Workflow criado: ${workflow.name} (${workflow.id}).`);
          return json(res, 201, workflow);
        }
        const workflowResource = route.match(/^\/api\/workflows\/([a-zA-Z0-9_-]+)(?:\/(activate))?$/);
        if (workflowResource) {
          const [, workflowId, action] = workflowResource;
          if (req.method === 'POST' && action === 'activate') return json(res, 200, await activateWorkflow(workflowId));
          if (!action && req.method === 'GET') return json(res, 200, await readWorkflow(workflowId));
          if (!action && req.method === 'PUT') return json(res, 200, await writeWorkflow(workflowId, await readBody(req)));
          if (!action && req.method === 'DELETE') {
            const result = await serializeMutation(files.workflows, async () => {
              const storage = await ensureWorkflowStorage();
              if (storage.workflows.length <= 1) throw Object.assign(new Error('Mantenha pelo menos um workflow cadastrado.'), { status: 409 });
              const running = [...activeRuns.values()].some(({ context }) => context.run.workflowId === workflowId) || executionQueue.some(item => item.run.workflowId === workflowId);
              if (running) throw Object.assign(new Error('Não é possível excluir um workflow com execução ativa.'), { status: 409 });
              if ((await readBoards()).some(board => board.workflowId === workflowId || (board.workflowIds || []).includes(workflowId) || (board.cards || []).some(card => card.workflowId === workflowId))) throw Object.assign(new Error('Este workflow está associado a um quadro ou cartão Kanban. Altere os vínculos antes de excluí-lo.'), { status: 409 });
              const remaining = storage.workflows.filter(workflow => workflow.id !== workflowId);
              if (remaining.length === storage.workflows.length) throw Object.assign(new Error(`Workflow não encontrado: ${workflowId}`), { status: 404 });
              storage.workflows = remaining;
              if (storage.activeId === workflowId) { storage.activeId = remaining[0].id; await writeJsonAtomic(files.activeWorkflow, storage.activeId); }
              await writeJsonAtomic(files.workflows, remaining); return { activeWorkflowId: storage.activeId };
            });
            logToConsole('warning', `Workflow removido: ${workflowId}.`);
            return json(res, 200, { ok: true, ...result });
          }
        }
        if (req.method === 'GET' && route === '/api/workflow') return json(res, 200, await readWorkflow());
        if (req.method === 'PUT' && route === '/api/workflow') {
          const current = await readWorkflow();
          let body;
          try { body = await readBody(req); }
          catch (error) { error.status ||= 400; throw error; }
          return json(res, 200, await writeWorkflow(current.id, body));
        }
        if (req.method === 'GET' && route === '/api/agents') return json(res, 200, await readAgents());
        if (req.method === 'POST' && route === '/api/agents') {
          const body = await readBody(req); const agent = await serializeMutation(files.agents, async () => {
            const created = validateAgent(body); const agents = await readAgents();
            if (agents.some(item => item.name.toLowerCase() === created.name.toLowerCase())) throw Object.assign(new Error('Já existe um agente com esse nome.'), { status: 409 });
            await ensureDatasetReferences(created.datasetIds);
            await ensureSkillReferences(created.skillIds);
            agents.push(created); await writeJsonAtomic(files.agents, agents); return created;
          });
          logToConsole('success', `Agente cadastrado: ${agent.name} · ${agent.runner}/${agent.model}.`);
          return json(res, 201, agent);
        }
        const agentResource = route.match(/^\/api\/agents\/([a-zA-Z0-9_-]+)$/);
        if (agentResource && req.method === 'PUT') {
          const [, agentId] = agentResource; const body = await readBody(req); const agent = await serializeMutation(files.agents, async () => {
            const agents = await readAgents(); const index = agents.findIndex(item => item.id === agentId);
            if (index < 0) throw Object.assign(new Error(`Agente não encontrado: ${agentId}`), { status: 404 });
            const updated = validateAgent(body, agentId);
            if (agents.some((item, position) => position !== index && item.name.toLowerCase() === updated.name.toLowerCase())) throw Object.assign(new Error('Já existe um agente com esse nome.'), { status: 409 });
            await ensureDatasetReferences(updated.datasetIds);
            await ensureSkillReferences(updated.skillIds);
            agents[index] = updated; await writeJsonAtomic(files.agents, agents); return updated;
          });
          logToConsole('info', `Agente atualizado: ${agent.name}.`);
          return json(res, 200, agent);
        }
        if (agentResource && req.method === 'DELETE') {
          const [, agentId] = agentResource; await serializeMutation(files.agents, async () => {
            const agents = await readAgents(); const remaining = agents.filter(item => item.id !== agentId);
            if (remaining.length === agents.length) throw Object.assign(new Error(`Agente não encontrado: ${agentId}`), { status: 404 });
            await writeJsonAtomic(files.agents, remaining);
          });
          logToConsole('warning', `Agente removido: ${agentId}.`); return json(res, 200, { ok: true });
        }
        if (req.method === 'GET' && route === '/api/runners') {
          const [runners, credentials] = await Promise.all([probeRunners(), safeCredentialMetadata()]);
          return json(res, 200, { runners: runners.map(item => ({ ...item, authenticated: !!item.oauthAvailable || credentials.some(credential => credential.provider === (item.id === 'claude' ? 'anthropic' : 'openai')) })), workspace: executionPath });
        }
        if (req.method === 'GET' && route === '/api/runtime/frameworks') return json(res, 200, { frameworks: await runtimeFrameworkStatus(), executionTarget: (await readSettings()).defaultExecutionTarget });
        if (req.method === 'GET' && route === '/api/skills') return json(res, 200, await readSkills());
        if (req.method === 'POST' && route === '/api/skills') {
          const body = await readBody(req); const skill = await serializeMutation(files.skills, async () => {
            const created = validateSkill(body); const skills = await readSkills();
            if (skills.some(item => item.name.toLowerCase() === created.name.toLowerCase())) throw Object.assign(new Error('Já existe uma Skill com esse nome.'), { status: 409 });
            skills.push(created); await writeJsonAtomic(files.skills, skills); return created;
          });
          logToConsole('success', `Skill cadastrada: ${skill.name}.`); return json(res, 201, skill);
        }
        const skillResource = route.match(/^\/api\/skills\/([a-zA-Z0-9_-]+)$/);
        if (skillResource && req.method === 'PUT') {
          const [, skillId] = skillResource; const body = await readBody(req); const skill = await serializeMutation(files.skills, async () => {
            const skills = await readSkills(); const index = skills.findIndex(item => item.id === skillId);
            if (index < 0) throw Object.assign(new Error(`Skill não encontrada: ${skillId}`), { status: 404 });
            const updated = validateSkill(body, skillId);
            if (skills.some((item, position) => position !== index && item.name.toLowerCase() === updated.name.toLowerCase())) throw Object.assign(new Error('Já existe uma Skill com esse nome.'), { status: 409 });
            skills[index] = updated; await writeJsonAtomic(files.skills, skills); return updated;
          });
          logToConsole('info', `Skill atualizada: ${skill.name}.`); return json(res, 200, skill);
        }
        if (skillResource && req.method === 'DELETE') {
          const [, skillId] = skillResource; const skills = await readSkills();
          if (!skills.some(item => item.id === skillId)) throw Object.assign(new Error(`Skill não encontrada: ${skillId}`), { status: 404 });
          if (skillId === DEFAULT_KANBAN_SKILL_ID) throw Object.assign(new Error('A Skill padrão de Kanban faz parte do workspace e não pode ser removida.'), { status: 409 });
          const agents = await readAgents(); const workflows = await readWorkflows();
          const usedInNodes = nodes => nodes.some(node => (node.config?.skillIds || []).includes(skillId) || (node.children && usedInNodes(node.children)));
          if (agents.some(agent => (agent.skillIds || []).includes(skillId)) || workflows.some(workflow => usedInNodes(workflow.nodes))) throw Object.assign(new Error('Desvincule esta Skill dos agentes e workflows antes de excluí-la.'), { status: 409 });
          await serializeMutation(files.skills, async () => writeJsonAtomic(files.skills, skills.filter(item => item.id !== skillId)));
          logToConsole('warning', `Skill removida: ${skillId}.`); return json(res, 200, { ok: true });
        }
        if (req.method === 'GET' && route === '/api/datasets') return json(res, 200, await allDatasets());
        if (req.method === 'POST' && route === '/api/datasets') {
          const body = await readBody(req);
          if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 120) throw Object.assign(new Error('Informe um nome de dataset com até 120 caracteres.'), { status: 400 });
          if (typeof body.content !== 'string' || !body.content.trim() || body.content.length > MAX_DATASET_CHARS) throw Object.assign(new Error('Dataset vazio ou maior que o limite de 600 mil caracteres.'), { status: 400 });
          const record = { id: crypto.randomUUID(), name: body.name.trim(), content: body.content, createdAt: new Date().toISOString() };
          await fs.mkdir(files.datasets, { recursive: true }); await writeJsonAtomic(path.join(files.datasets, `${record.id}.json`), record);
          return json(res, 201, { id: record.id, name: record.name, chars: record.content.length, createdAt: record.createdAt });
        }
        const datasetDelete = route.match(/^\/api\/datasets\/([a-zA-Z0-9_-]+)$/);
        if (req.method === 'DELETE' && datasetDelete) {
          const datasetId = datasetDelete[1]; const workflows = await readWorkflows(); const agents = await readAgents();
          const usedInWorkflow = nodes => nodes.some(node => (node.config?.datasetIds || []).includes(datasetId) || (node.children && usedInWorkflow(node.children)));
          if (workflows.some(workflow => usedInWorkflow(workflow.nodes)) || agents.some(agent => (agent.datasetIds || []).includes(datasetId))) throw Object.assign(new Error('Desvincule o dataset das etapas e agentes antes de excluí-lo.'), { status: 409 });
          await fs.rm(path.join(files.datasets, `${datasetId}.json`), { force: true }); logToConsole('warning', `Dataset removido: ${datasetId}.`); return json(res, 200, { ok: true });
        }
        if (req.method === 'GET' && route === '/api/credentials') return json(res, 200, await safeCredentialMetadata());
        if (req.method === 'POST' && route === '/api/credentials') {
          const body = await readBody(req);
          if (!['openai', 'anthropic'].includes(body.provider)) throw Object.assign(new Error('Provider deve ser openai ou anthropic.'), { status: 400 });
          if (typeof body.token !== 'string' || body.token.length < 8 || body.token.length > 5000) throw Object.assign(new Error('API key ou token inválido.'), { status: 400 });
          const records = await loadJson(files.credentials, []); const id = crypto.randomUUID();
          const secret = encryptCredential(body.token, await getKey());
          const record = { id, provider: body.provider, label: String(body.label || `${body.provider} credential`).slice(0, 120), createdAt: new Date().toISOString(), secret };
          records.push(record); await writeJsonAtomic(files.credentials, records);
          return json(res, 201, { id, provider: record.provider, label: record.label, createdAt: record.createdAt });
        }
        const credentialDelete = route.match(/^\/api\/credentials\/([a-zA-Z0-9_-]+)$/);
        if (req.method === 'DELETE' && credentialDelete) {
          const records = (await loadJson(files.credentials, [])).filter(item => item.id !== credentialDelete[1]);
          await writeJsonAtomic(files.credentials, records); return json(res, 200, { ok: true });
        }
        if (req.method === 'GET' && route === '/api/runs') {
          const runs = await readRunHistory();
          return json(res, 200, runs.map(run => ({ ...run, runtimeActive: isRuntimeRunActive(run.id) })));
        }
        if (req.method === 'POST' && route === '/api/runs') {
          const body = await readBody(req); const input = String(body.input || '').trim();
          if (!input || input.length > 15_000) throw Object.assign(new Error('Descreva a solicitação (até 15 mil caracteres).'), { status: 400 });
          const workflow = await readWorkflow(body.workflowId || null); const run = { id: crypto.randomUUID(), workflowId: workflow.id, workflowName: workflow.name, status: 'queued', input, createdAt: new Date().toISOString(), steps: [], log: [], outputTail: '' };
          await persistRun(run); await enqueueExecution(run, workflow, input);
          logToConsole('info', `Solicitação recebida para “${workflow.name}”: ${input.slice(0, 180)}.`, run);
          return json(res, 202, { id: run.id, status: run.status });
        }
        const eventRoute = route.match(/^\/api\/runs\/([a-zA-Z0-9_-]+)\/events$/);
        if (req.method === 'GET' && eventRoute) {
          const [, runId] = eventRoute;
          let clients = runSubscribers.get(runId); if (!clients) { clients = new Set(); runSubscribers.set(runId, clients); }
          clients.add(res);
          res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
          res.write('retry: 1500\n\n');
          const runs = await readRunHistory(); const run = runs.find(item => item.id === runId);
          if (!run) { res.write(`event: error\ndata: ${JSON.stringify({ message: 'Execução não encontrada.' })}\n\n`); res.end(); clients.delete(res); return; }
          res.write(`event: snapshot\ndata: ${JSON.stringify({ ...run, runtimeActive: isRuntimeRunActive(runId) })}\n\n`);
          const heartbeat = setInterval(() => { if (!res.destroyed) res.write(': ping\n\n'); }, 15_000); heartbeat.unref?.();
          req.on('close', () => { clearInterval(heartbeat); clients.delete(res); if (!clients.size) runSubscribers.delete(runId); });
          return;
        }
        const runRoute = route.match(/^\/api\/runs\/([a-zA-Z0-9_-]+)(?:\/(approve|cancel))?$/);
        if (runRoute) {
          const [, runId, action] = runRoute;
          const run = (await readRunHistory()).find(item => item.id === runId);
          if (!run) throw Object.assign(new Error('Execução não encontrada.'), { status: 404 });
          const active = activeRuns.get(runId);
          if (req.method === 'GET' && !action) return json(res, 200, { ...run, runtimeActive: isRuntimeRunActive(runId) });
          if (req.method === 'POST' && action === 'approve') {
            const body = await readBody(req); if (!['approve', 'reject'].includes(body.decision)) throw Object.assign(new Error('decision deve ser approve ou reject.'), { status: 400 });
            if (run.status !== 'waiting_approval' || !active?.context.pendingDecision) throw Object.assign(new Error('Esta execução não está aguardando aprovação.'), { status: 409 });
            active.context.pendingDecision(body.decision); return json(res, 200, { ok: true, decision: body.decision });
          }
          if (req.method === 'POST' && action === 'cancel') {
            const queuedIndex = executionQueue.findIndex(item => item.run.id === runId);
            if (queuedIndex >= 0) {
              executionQueue.splice(queuedIndex, 1); run.status = 'cancelled'; run.finishedAt = new Date().toISOString();
              await appendLog(run, 'Execução cancelada enquanto aguardava a fila.', 'warning');
              return json(res, 200, { ok: true, status: run.status });
            }
            active?.controller.abort(); return json(res, 200, { ok: true, status: active ? 'cancelling' : run.status });
          }
          throw Object.assign(new Error('Rota não encontrada.'), { status: 404 });
        }
        return json(res, 404, { error: 'Rota não encontrada.' });
      }
      if (route === '/mcp') {
        if (!validateMcpHost(req, res)) { logToConsole('warning', 'MCP rejeitado · Host não local.'); return; }
        if (!validateMcpOrigin(req, res)) { logToConsole('warning', 'MCP rejeitado · Origin não local.'); return; }
        return await mcpNodeHandler(req, res);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Método não permitido.' });
      const relative = decodeURIComponent(route === '/' ? '/index.html' : route);
      const file = path.resolve(publicDir, `.${relative}`);
      if (!file.startsWith(`${publicDir}${path.sep}`) && file !== path.join(publicDir, 'index.html')) return json(res, 403, { error: 'Caminho inválido.' });
      let data;
      try { data = await fs.readFile(file); } catch (error) { if (error.code === 'ENOENT') return json(res, 404, { error: 'Arquivo não encontrado.' }); throw error; }
      const extension = path.extname(file);
      const cacheControl = ['.html', '.js', '.css'].includes(extension) ? 'no-cache' : 'public, max-age=3600';
      res.writeHead(200, { 'content-type': MIME[extension] || 'application/octet-stream', 'content-length': data.length, 'cache-control': cacheControl });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) {
      if (route.startsWith('/api/') || route === '/mcp') logToConsole(error.status >= 500 || !error.status ? 'error' : 'warning', `${req.method} ${route} → ${error.status || 500}: ${error.message}`);
      json(res, error.status || 500, { error: error.message || 'Erro interno.' });
    }
  });
  logToConsole('success', `Servidor MCP Kanban ativo em /mcp · ${mcpToolNames.length} ferramentas para os agentes.`);
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8080);
  const server = createAppServer();
  server.listen(port, '0.0.0.0', () => {
    console.log(`\n╭──────────────────────────────────────────╮\n│  ✓ Open Agents SDLC está no ar            │\n├──────────────────────────────────────────┤\n│  Endereço: http://localhost:${String(port).padEnd(21)}│\n│  Workspace: ${String(process.env.WORKSPACE_DIR || '/workspace').padEnd(29)}│\n╰──────────────────────────────────────────╯\n`);
  });
}

export { defaultWorkflow, validateWorkflow, sortNodes };
