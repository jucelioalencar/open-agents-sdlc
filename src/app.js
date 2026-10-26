import { getLocale, localizeError, setLocale, t } from './i18n.js';
import { arrangeNodes, findAvailableNodePosition, graphNodesInOrder as orderGraphNodes } from './graph-layout.js';
import { createCanvasNavigation } from './canvas-navigation.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const api = async (url, options = {}) => {
  const response = await fetch(url, { headers: { 'content-type': 'application/json', ...(options.headers || {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Erro HTTP ${response.status}`);
  return data;
};
const THEME_STORAGE_KEY = 'open-agents-sdlc-theme';
const DEFAULT_KANBAN_SKILL_ID = 'kanban-mcp-guide';
function savedTheme() { try { return localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark'; } catch { return 'dark'; } }
function applyTheme(theme, persist = false) {
  const normalized = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = normalized;
  document.documentElement.style.colorScheme = normalized;
  const themeColor = $('meta[name="theme-color"]');
  if (themeColor) themeColor.content = normalized === 'light' ? '#f7f8fa' : '#111114';
  const themeLabel = $('#settingsThemeLabel');
  if (themeLabel) themeLabel.textContent = `${t('Tema aplicado à interface')}: ${normalized === 'light' ? t('Claro').toLowerCase() : t('Escuro').toLowerCase()}`;
  if (persist) { try { localStorage.setItem(THEME_STORAGE_KEY, normalized); } catch { /* Theme remains active for this page. */ } }
}
function setSettingsTab(name = 'general') {
  const selected = ['general', 'execution', 'kubernetes', 'appearance', 'language'].includes(name) ? name : 'general';
  $$('#settingsTabs [role="tab"]').forEach(tab => {
    const active = tab.dataset.settingsTab === selected;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  $$('#settingsForm [role="tabpanel"]').forEach(panel => { panel.hidden = panel.dataset.settingsPanel !== selected; });
}
function setBoardSettingsTab(name = 'general') {
  const selected = ['general', 'workflows', 'structure', 'cards'].includes(name) ? name : 'general';
  $$('#boardSettingsTabs [role="tab"]').forEach(tab => {
    const active = tab.dataset.boardSettingsTab === selected;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  $$('#boardSettingsForm [role="tabpanel"]').forEach(panel => { panel.hidden = panel.dataset.boardSettingsPanel !== selected; });
}
applyTheme(savedTheme());
setLocale(getLocale(), false);
const state = { workflow: null, workflows: { workflows: [], activeWorkflowId: null }, templates: [], selectedTemplateId: 'sdlc-standard', suppressPaletteClickUntil: 0, agents: [], skills: [], boards: [], currentBoardId: null, kanbanRunId: null, settings: { defaultRunner: 'codex', defaultModel: 'gpt-6-luna', defaultEffort: 'high', agentTimeoutMinutes: 15, integrationTimeoutMinutes: 5, maxConcurrentRuns: 3, defaultExecutionTarget: 'container', kubernetesNamespace: 'default', kubernetesContext: '', kubernetesImage: '', kubernetesWorkspacePvc: '', kubernetesWorkspaceSubPath: '', kubernetesKubeconfigPath: '' }, selected: null, nestedParent: null, nestedStack: [], datasets: [], credentials: [], runners: [], frameworks: [], workspacePath: '/workspace', pendingConnection: null, saveTimer: null, pollTimer: null, activeRun: null, latestRunId: null, currentRunSnapshot: null, displayedRun: null, eventSource: null, eventSourceId: null, renderedLogKeys: new Set(), zoom: 100, history: [], undoStack: [], redoStack: [], savedWorkflowSnapshot: null, suppressHistory: false };
let palettePointerDrag = null;
const canvas = $('#canvas');
const svg = $('.edges');
const canvasNavigation = createCanvasNavigation({ canvas, viewport: $('#canvasWrap'), onZoomChange: value => { state.zoom = value; $('#zoomValue').textContent = `${value}%`; } });
const runnerLabels = { codex: ['Codex CLI', 'OpenAI', '✳', 'codex-logo'], claude: ['Claude Code', 'Anthropic', '✳', 'claude-logo'], opencode: ['OpenCode', 'OpenCode', '◉', 'opencode-logo'] };
const nodeLooks = { trigger: ['✦', 'trigger-icon', 'INÍCIO'], agent: ['◈', 'planner-icon', 'AGENTE DE IA'], subworkflow: ['⌘', 'workflow-icon', 'SUB-WORKFLOW'], approval: ['◷', 'gate-icon', 'APROVAÇÃO HUMANA'], integration: ['↥', 'deploy-icon', 'INTEGRAÇÃO'], condition: ['⑂', 'gate-icon', 'CONDIÇÃO'] };

function notify(message, type = 'info') {
  const item = document.createElement('div'); item.className = `notice ${type}`; item.textContent = localizeError(message); document.body.append(item);
  setTimeout(() => item.remove(), 4200);
}
function showWorkflowHelp() {
  notify('Edite pelo canvas: adicione uma etapa, clique nela para configurar e conecte a saída à entrada. Use Histórico e Logs para acompanhar execuções.');
}
function currentGraph() { const parent = state.nestedStack.at(-1) || state.nestedParent; return parent ? parent.children : state.workflow?.nodes || []; }
function currentEdges() { const parent = state.nestedStack.at(-1) || state.nestedParent; return parent ? (parent.childEdges ||= currentGraph().slice(1).map((node, index) => [currentGraph()[index].id, node.id])) : state.workflow?.edges || []; }
function graphFind(id) { return currentGraph().find(node => node.id === id); }
function safeId(text) { return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'etapa'; }
function displayRunner(id) { return runnerLabels[id] || runnerLabels.codex; }
function updateWorkflowRuntimeBadge() {
  if (!state.workflow) return;
  const execution = state.workflow.execution || { target: 'container', frameworks: [] };
  $('#workflowRuntimeLabel').textContent = execution.target === 'kubernetes' ? 'Kubernetes' : 'Container';
  const selected = execution.frameworks || [];
  $('#workflowFrameworkCount').textContent = selected.length ? `${selected.length} toolchain${selected.length === 1 ? '' : 's'}` : 'Sem frameworks extras';
}
function setCurrentWorkflow(workflow) {
  state.workflow = workflow; state.nestedParent = null; state.nestedStack = []; state.selected = null;
  state.workflow.execution ||= { target: state.settings.defaultExecutionTarget || 'container', frameworks: [] };
  state.workflow.execution.frameworks ||= [];
  state.undoStack = []; state.redoStack = []; state.savedWorkflowSnapshot = JSON.stringify(workflow); state.suppressHistory = false;
  updateUndoButtons(); updateWorkspaceSummary(); updateWorkflowRuntimeBadge();
}
function updateWorkspaceSummary() {
  $('#workspaceRunCount').textContent = state.history.length;
  $('#workspaceWorkflowCount').textContent = state.workflows.workflows.length;
  $('#workspaceAgentCount').textContent = state.agents.length;
  $('#headingAgentCount').textContent = state.agents.length;
  $('#headingWorkflowCount').textContent = state.workflows.workflows.length;
}
function updateUndoButtons() {
  const current = state.workflow ? JSON.stringify(state.workflow) : null;
  $('#undoBtn').disabled = !state.undoStack.length && (!current || !state.savedWorkflowSnapshot || current === state.savedWorkflowSnapshot);
  $('#redoBtn').disabled = !state.redoStack.length;
}
function restoreWorkflowSnapshot(direction) {
  if (!state.workflow) return;
  const current = JSON.stringify(state.workflow);
  const source = direction === 'undo' ? state.undoStack : state.redoStack;
  const destination = direction === 'undo' ? state.redoStack : state.undoStack;
  const snapshot = source.pop() || (direction === 'undo' && current !== state.savedWorkflowSnapshot ? state.savedWorkflowSnapshot : null);
  if (!snapshot) return;
  destination.push(current);
  if (destination.length > 50) destination.shift();
  const selected = state.selected;
  state.workflow = JSON.parse(snapshot); state.nestedParent = null; state.nestedStack = []; state.selected = null; state.suppressHistory = true;
  renderGraph();
  const node = state.workflow.nodes.find(item => item.id === selected) || state.workflow.nodes.find(item => item.type === 'agent') || state.workflow.nodes[0];
  if (node) selectNode(node.id);
  scheduleSave(); updateUndoButtons();
}
function graphNodesInOrder(nodes = currentGraph(), edges = currentEdges()) { return orderGraphNodes(nodes, edges); }

async function boot() {
  try {
    const workflow = await api('/api/workflow');
    const [workflows, templates, agents, skills, datasets, credentials, settings, result, frameworkStatus, boards] = await Promise.all([api('/api/workflows'), api('/api/workflow-templates'), api('/api/agents'), api('/api/skills'), api('/api/datasets'), api('/api/credentials'), api('/api/settings'), api('/api/runners'), api('/api/runtime/frameworks'), api('/api/boards')]);
    state.settings = settings; setCurrentWorkflow(workflow); state.boards = boards; state.workflows = workflows; state.templates = templates; state.agents = agents; state.skills = skills; state.datasets = datasets; state.credentials = credentials; state.frameworks = frameworkStatus.frameworks;
    state.runners = result.runners;
    state.workspacePath = result.workspace;
    $('#workflowCount').textContent = workflows.workflows.length; $('#boardCount').textContent = boards.length; $('#agentCount').textContent = agents.length; $('#skillCount').textContent = skills.length; $('#datasetCount').textContent = datasets.length;
    $('#workspacePath').textContent = result.workspace;
    $('#workspacePathLabel').textContent = result.workspace;
    updateWorkspaceSummary();
    $('#healthText').textContent = 'Runtime conectado';
    $('#healthDot').style.background = '#42bd8c';
    $('#runnerSummary').textContent = `${state.runners.filter(item => item.installed).length} ${t('runners disponíveis')}`;
    $$('.runner-state').forEach(element => { const runner = element.closest('button').dataset.runner; const info = state.runners.find(item => item.id === runner); element.textContent = info?.installed ? 'Instalado' : 'Não instalado'; element.classList.toggle('runner-connected', !!info?.installed); });
    renderGraph(); canvasNavigation.fit(); updateWorkflowRuntimeBadge(); await refreshHistory();
    const selected = state.workflow.nodes.find(node => node.type === 'agent') || state.workflow.nodes[0];
    selectNode(selected.id);
    const liveRun = state.history.filter(run => run.runtimeActive && ['queued', 'running', 'waiting_approval'].includes(run.status)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    if (liveRun) await resumeActiveRun(liveRun);
    else {
      const interruptedRun = state.history.find(runWasInterrupted);
      if (interruptedRun) await restoreInterruptedRun(interruptedRun);
    }
  } catch (error) {
    $('#healthText').textContent = 'Runtime indisponível'; $('#healthDot').style.background = '#dc7676'; notify(`Não foi possível conectar ao runtime: ${error.message}`, 'error');
  }
}

function addSvgEdge(from, to) {
  const a = graphFind(from); const b = graphFind(to); if (!a || !b) return;
  const width = Math.max(canvas.clientWidth, 1); const height = Math.max(canvas.clientHeight, 1);
  const fromElement = $$('.flow-node', canvas).find(node => node.dataset.node === from);
  const toElement = $$('.flow-node', canvas).find(node => node.dataset.node === to);
  const sx = ((fromElement?.offsetLeft ?? Number(a.position?.x || 0) * width / 100) + (fromElement?.offsetWidth || 215)) / width * 1000;
  const sy = ((fromElement?.offsetTop ?? Number(a.position?.y || 0) * height / 100) + (fromElement?.offsetHeight || 79) / 2) / height * 680;
  const ex = (toElement?.offsetLeft ?? Number(b.position?.x || 0) * width / 100) / width * 1000;
  const ey = ((toElement?.offsetTop ?? Number(b.position?.y || 0) * height / 100) + (toElement?.offsetHeight || 79) / 2) / height * 680;
  const curve = Math.min(85, Math.max(25, Math.abs(ex - sx) * .42));
  const d = Math.abs(ey - sy) < 3 ? `M ${sx} ${sy} C ${sx + curve} ${sy}, ${ex - curve} ${ey}, ${ex} ${ey}` : `M ${sx} ${sy} C ${sx + curve} ${sy}, ${ex - curve} ${ey}, ${ex} ${ey}`;
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', d); path.setAttribute('class', 'edge dynamic-edge'); path.dataset.from = from; path.dataset.to = to; path.setAttribute('role', 'button'); path.setAttribute('tabindex', '0'); path.setAttribute('aria-label', `Remover conexão entre ${a.name} e ${b.name}`);
  const removeEdge = event => {
    event.preventDefault(); event.stopPropagation();
    const activeEdges = currentEdges(); const index = activeEdges.findIndex(edge => edge[0] === from && edge[1] === to);
    if (index < 0) return;
    activeEdges.splice(index, 1); scheduleSave(); renderGraph(); notify(`Conexão removida: ${a.name} → ${b.name}.`);
  };
  path.addEventListener('click', removeEdge); path.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') removeEdge(event); });
  svg.append(path);
}

function renderGraph() {
  if (!state.workflow) return;
  $$('.flow-node', canvas).forEach(node => node.remove()); svg.replaceChildren();
  const nodes = currentGraph(); const edges = currentEdges();
  for (const node of nodes) {
    const [icon, style, kind] = nodeLooks[node.type] || nodeLooks.agent;
    const element = document.createElement('div'); element.className = 'flow-node'; element.dataset.node = node.id; element.dataset.type = node.type;
    const position = node.position || { x: Math.min(78, 12 + nodes.indexOf(node) * 26), y: 38 };
    node.position = { x: Number(position.x), y: Number(position.y) };
    element.style.left = `${position.x}%`; element.style.top = `${position.y}%`;
    const config = node.config || {}; const runner = displayRunner(config.runner);
    const subtitle = node.type === 'agent' ? `${runner[0]} · ${config.model || 'gpt-6-luna'}` : node.type === 'subworkflow' ? `${(node.children || []).length} agentes · ${(node.children || []).length + 2} etapas` : node.type === 'approval' ? 'Pausa para revisão humana' : node.type === 'integration' ? config.command || 'Configurar comando' : node.type === 'trigger' ? 'Entrada manual' : 'Definir condição';
    element.innerHTML = `<span class="node-icon ${style}">${icon}</span><div class="node-copy"><span class="node-kind">${kind}</span><b></b><small></small></div><span class="node-menu">···</span>${node.type === 'trigger' ? '' : '<button type="button" class="port port-left" data-port="in" aria-label="Conectar entrada da etapa" title="Entrada"></button>'}<button type="button" class="port port-right" data-port="out" aria-label="Conectar saída da etapa" title="Saída"></button>${node.type === 'subworkflow' ? '<button class="open-workflow">Abrir workflow <span>↗</span></button>' : ''}`;
    $('b', element).textContent = node.name; $('small', element).textContent = subtitle;
    element.addEventListener('click', event => {
      if (event.target.closest('.open-workflow')) { openNested(node); return; }
      if (state.pendingConnection) { state.pendingConnection = null; renderGraph(); notify('Conexão cancelada. Clique na entrada para ligar as etapas.'); return; }
      selectNode(node.id);
    });
    element.querySelectorAll('.port').forEach(port => port.addEventListener('click', event => beginConnection(event, node.id, port.dataset.port)));
    installDrag(element, node);
    canvas.append(element);
  }
  edges.forEach(([from, to]) => addSvgEdge(from, to));
  state.nestedParent = state.nestedStack.at(-1) || null;
  const root = state.nestedParent ? state.nestedParent.name : state.workflow.name;
  $('h1').childNodes[0].textContent = `${root} `;
  const breadcrumbs = $('.breadcrumbs'); breadcrumbs.replaceChildren();
  const addCrumb = (label, depth, active = false) => {
    if (active) { const current = document.createElement('b'); current.textContent = label; breadcrumbs.append(current); return; }
    const button = document.createElement('button'); button.type = 'button'; button.className = 'crumb-action'; button.textContent = label; button.addEventListener('click', () => navigateNested(depth)); breadcrumbs.append(button);
  };
  const addSlash = () => { const slash = document.createElement('span'); slash.className = 'slash'; slash.textContent = '/'; breadcrumbs.append(slash); };
  if (state.nestedStack.length) {
    addCrumb(state.workflow.name, 0); addSlash();
    state.nestedStack.forEach((node, index) => { addCrumb(node.name, index + 1, index === state.nestedStack.length - 1); if (index < state.nestedStack.length - 1) addSlash(); });
    const badge = document.createElement('span'); badge.className = 'draft-badge'; badge.innerHTML = '<i></i>Salvo'; breadcrumbs.append(badge);
    $('.eyebrow').innerHTML = '<span class="workflow-glyph">⌘</span> SUB-WORKFLOW <span class="dot-sep">·</span> AGENTES EM SEQUÊNCIA';
  } else {
    const section = document.createElement('span'); section.textContent = 'Workflows'; breadcrumbs.append(section); addSlash(); addCrumb(state.workflow.name, 0, true);
    const badge = document.createElement('span'); badge.className = 'draft-badge'; badge.innerHTML = '<i></i>Salvo'; breadcrumbs.append(badge);
    $('.eyebrow').innerHTML = '<span class="workflow-glyph">⌘</span> WORKFLOW <span class="dot-sep">·</span> SALVAMENTO AUTOMÁTICO';
  }
  $('#tailAdd').style.display = state.nestedStack.length ? 'none' : '';
  $('#backWorkflow').classList.toggle('hidden', !state.nestedStack.length);
  if (state.currentRunSnapshot) updateNodeStatuses(state.currentRunSnapshot);
}

function wouldCreateCycle(from, to, edges = currentEdges()) {
  const outgoing = new Map();
  edges.forEach(([source, target]) => { if (!outgoing.has(source)) outgoing.set(source, []); outgoing.get(source).push(target); });
  const pending = [to]; const visited = new Set();
  while (pending.length) {
    const id = pending.pop();
    if (id === from) return true;
    if (visited.has(id)) continue;
    visited.add(id); pending.push(...(outgoing.get(id) || []));
  }
  return false;
}

function beginConnection(event, id, port) {
  event.stopPropagation(); event.preventDefault();
  if (port === 'out') { state.pendingConnection = id; $$('.flow-node').forEach(node => node.classList.toggle('connection-source', node.dataset.node === id)); notify('Saída selecionada · clique na entrada da próxima etapa.', 'info'); return; }
  if (!state.pendingConnection) return;
  const from = state.pendingConnection; const edges = currentEdges();
  if (from === id) { state.pendingConnection = null; renderGraph(); notify('Escolha uma etapa diferente para criar a conexão.', 'error'); return; }
  if (edges.some(edge => edge[0] === from && edge[1] === id)) { notify('Essas etapas já estão conectadas.'); state.pendingConnection = null; renderGraph(); return; }
  if (wouldCreateCycle(from, id, edges)) { notify('Essa conexão criaria um ciclo. Escolha outra etapa.', 'error'); state.pendingConnection = null; renderGraph(); return; }
  edges.push([from, id]); state.pendingConnection = null; scheduleSave(); renderGraph(); notify('Conexão criada.');
}

function installDrag(element, node) {
  let start = null; let moved = false;
  element.addEventListener('pointerdown', event => {
    if (event.target.closest('button,.port')) return;
    start = { x: event.clientX, y: event.clientY, left: parseFloat(element.style.left), top: parseFloat(element.style.top) };
    element.setPointerCapture(event.pointerId);
  });
  element.addEventListener('pointermove', event => {
    if (!start) return;
    const dx = event.clientX - start.x; const dy = event.clientY - start.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
    if (!moved) return;
    const bounds = canvas.getBoundingClientRect(); const scaleX = bounds.width / canvas.clientWidth || 1; const scaleY = bounds.height / canvas.clientHeight || 1;
    element.style.left = `${Math.min(85, Math.max(1, start.left + dx / scaleX / canvas.clientWidth * 100))}%`;
    element.style.top = `${Math.min(82, Math.max(4, start.top + dy / scaleY / canvas.clientHeight * 100))}%`;
    node.position = { x: parseFloat(element.style.left), y: parseFloat(element.style.top) };
    svg.replaceChildren(); currentEdges().forEach(([from, to]) => addSvgEdge(from, to));
  });
  element.addEventListener('pointerup', () => { if (moved) scheduleSave(); start = null; setTimeout(() => moved = false, 0); });
}

function selectNode(id) {
  const node = graphFind(id); if (!node) return;
  showInspectorTab('config');
  state.selected = id; const config = node.config ||= {};
  $$('.flow-node').forEach(element => element.classList.toggle('selected-node', element.dataset.node === id));
  $('#inspectorNodeName').textContent = node.name; $('#nodeName').value = node.name;
  const [icon] = nodeLooks[node.type] || nodeLooks.agent; $('.inspector-mark').textContent = icon;
  $('.inspector-label').textContent = `CONFIGURAR ${node.type === 'agent' ? 'AGENTE' : node.type === 'approval' ? 'APROVAÇÃO' : node.type === 'integration' ? 'INTEGRAÇÃO' : node.type === 'subworkflow' ? 'SUB-WORKFLOW' : 'ETAPA'}`;
  $$('.agent-only').forEach(element => element.classList.toggle('hidden', node.type !== 'agent'));
  $('#integrationConfig').classList.toggle('hidden', node.type !== 'integration');
  $('#approvalConfig').classList.toggle('hidden', node.type !== 'approval'); $('#conditionConfig').classList.toggle('hidden', node.type !== 'condition');
  if (node.type === 'agent') {
    const runner = config.runner || 'codex'; const details = displayRunner(runner);
    renderAgentTemplatePicker(config.agentId || '');
    $('.runner-logo', $('#runnerSelect')).textContent = details[2]; $('.runner-logo', $('#runnerSelect')).className = `runner-logo ${details[3]}`;
    $('#runnerSelect .runner-copy b').textContent = details[0]; $('#runnerSelect .runner-copy small').textContent = `${details[1]} · CLI`;
    setModels(runner, config.model || 'gpt-6-luna'); $('#effortSelect').value = config.effort || 'high'; $('#harnessSelect').value = config.harness || runner; $('#promptBox').textContent = config.prompt || '';
    renderDatasets(config.datasetIds || []); renderNodeSkills(config.skillIds || []); renderCredentialPicker(config.credentialId || '');
  }
  if (node.type === 'integration') $('#integrationCommand').value = config.command || '';
  if (node.type === 'approval') $('#approvalMessage').value = config.message || '';
  if (node.type === 'condition') $('#conditionContains').value = config.contains || '';
  $('#deleteNode').disabled = node.type === 'trigger'; $('#deleteNode').style.opacity = node.type === 'trigger' ? '.4' : '';
  $('#inspector').classList.remove('inspector-hidden');
}

function showInspectorTab(tab) {
  const showConfig = tab === 'config';
  $('#nodeConfigTab').classList.toggle('active', showConfig); $('#nodeOutputTab').classList.toggle('active', !showConfig);
  $$('.inspector-scroll > .form-section, .inspector-scroll > .advanced-row').forEach(element => element.classList.toggle('hidden', !showConfig));
  $('#nodeOutputPanel').classList.toggle('hidden', showConfig);
  if (!showConfig) {
    const node = graphFind(state.selected); const outputs = state.history.flatMap(run => (run.steps || []).filter(step => step.nodeId === node?.id).map(step => ({ run, step })));
    const latest = outputs.at(-1);
    if (latest) {
      const failure = localizeError(latest.step.error || (latest.step.status === 'failed' ? latest.run.error : ''));
      const result = failure ? `${t('Falha')}: ${failure}\n\n${latest.step.output || ''}` : latest.step.output || `(${t('Sem saída textual')})`;
      $('#nodeOutputContent').textContent = `${result}\n\n${t('Execução')}: ${latest.run.workflowName || 'Workflow'} · ${new Date(latest.run.createdAt).toLocaleString()} · ${latest.step.status}`;
    } else $('#nodeOutputContent').textContent = t('Esta etapa ainda não tem saída registrada. Execute o workflow para ver o resultado aqui.');
  }
}

function renderAgentTemplatePicker(selectedId = '') {
  const select = $('#agentTemplateSelect');
  select.replaceChildren(new Option('Configuração livre', ''));
  for (const agent of state.agents) select.add(new Option(`${agent.name} · ${displayRunner(agent.runner)[0]}`, agent.id));
  select.value = selectedId || '';
}

function setModels(runner, selected) {
  const catalog = runner === 'claude' ? ['sonnet', 'opus', 'haiku'] : ['gpt-6-luna', 'gpt-6.1-sol', 'gpt-6-astra', 'gpt-5.6-luna', 'gpt-5.3-codex'];
  if (runner === 'opencode') catalog.push('anthropic/claude-sonnet-4-5');
  const select = $('#modelSelect'); select.replaceChildren(...catalog.map(model => new Option(model, model)));
  if (!catalog.includes(selected)) { const option = new Option(selected, selected); select.add(option); }
  select.value = selected;
}

function renderDatasets(selectedIds) {
  const list = $('#datasetList'); list.replaceChildren();
  const assigned = new Set(selectedIds || []);
  for (const item of state.datasets) {
    const row = document.createElement('label'); row.className = 'dataset-card';
    row.innerHTML = '<input type="checkbox" class="dataset-check"><span class="dataset-icon">▤</span><span><b></b><small></small></span>';
    $('input', row).checked = assigned.has(item.id); $('b', row).textContent = item.name; $('small', row).textContent = `${item.chars.toLocaleString()} caracteres · dataset local`;
    $('input', row).addEventListener('change', () => { const node = graphFind(state.selected); const ids = new Set(node.config.datasetIds || []); $('input', row).checked ? ids.add(item.id) : ids.delete(item.id); node.config.datasetIds = [...ids]; scheduleSave(); });
    list.append(row);
  }
  $('#datasetEmpty').classList.toggle('hidden', state.datasets.length > 0);
}

function renderNodeSkills(selectedIds = []) {
  const list = $('#nodeSkillList'); list.replaceChildren(); const assigned = new Set(selectedIds);
  if (!state.skills.length) { const empty = document.createElement('small'); empty.className = 'field-hint'; empty.textContent = 'Nenhuma Skill cadastrada. Use “Gerenciar Skills” para criar a primeira.'; list.append(empty); return; }
  for (const skill of state.skills) {
    const row = document.createElement('label'); row.className = 'skill-checkbox-item';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = assigned.has(skill.id);
    const copy = document.createElement('span'); const name = document.createElement('b'); name.textContent = skill.name; copy.append(name);
    if (skill.description) { const description = document.createElement('small'); description.textContent = skill.description; copy.append(description); }
    checkbox.addEventListener('change', () => { const node = graphFind(state.selected); if (!node) return; const ids = new Set(node.config.skillIds || []); checkbox.checked ? ids.add(skill.id) : ids.delete(skill.id); node.config.skillIds = [...ids]; scheduleSave(); });
    row.append(checkbox, copy); list.append(row);
  }
}

function renderCredentialPicker(selected) {
  const select = $('#credentialSelect'); select.replaceChildren(new Option('Usar primeiro disponível', ''));
  for (const credential of state.credentials) select.add(new Option(`${credential.label} · ${credential.provider}`, credential.id));
  const codexOAuth = state.runners.find(item => item.id === 'codex')?.oauthAvailable;
  if (codexOAuth && graphFind(state.selected)?.config.runner === 'codex') select.add(new Option('Codex CLI · OAuth desta máquina', 'machine-codex-oauth'));
  select.value = selected || (codexOAuth && graphFind(state.selected)?.config.runner === 'codex' ? 'machine-codex-oauth' : '');
  updateCredentialCard(select.value);
}
function updateCredentialCard(id) {
  if (id === 'machine-codex-oauth') {
    $('#credentialName').textContent = 'Codex CLI · OAuth local'; $('#credentialHint').textContent = 'Sessão desta máquina montada somente para leitura.'; $('#credentialState').textContent = '●';
    const node = graphFind(state.selected); if (node?.config) node.config.credentialId = id;
    return;
  }
  const credential = state.credentials.find(item => item.id === id) || (id ? null : state.credentials.find(item => item.provider === (graphFind(state.selected)?.config.runner === 'claude' ? 'anthropic' : 'openai')));
  $('#credentialName').textContent = credential?.label || 'Nenhuma credencial disponível';
  $('#credentialHint').textContent = credential ? `${credential.provider} · chave protegida` : 'Adicione uma API key para habilitar o runner.';
  $('#credentialState').textContent = credential ? '●' : '';
  const node = graphFind(state.selected); if (node?.config) node.config.credentialId = id || null;
}

function scheduleSave() {
  if (!state.suppressHistory) state.redoStack = [];
  updateUndoButtons();
  $('.saved-state').innerHTML = '<i style="background:#e7aa57"></i>Salvando…'; clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(async () => {
    const workflowSnapshot = JSON.stringify(state.workflow); const beforeSave = state.savedWorkflowSnapshot;
    try {
      const saved = await api('/api/workflow', { method: 'PUT', body: workflowSnapshot });
      if (!state.suppressHistory && beforeSave && beforeSave !== workflowSnapshot) { state.undoStack.push(beforeSave); if (state.undoStack.length > 50) state.undoStack.shift(); }
      state.workflow = JSON.stringify(state.workflow) === workflowSnapshot ? saved : state.workflow;
      state.savedWorkflowSnapshot = JSON.stringify(saved); state.suppressHistory = false;
      $('.saved-state').innerHTML = '<i></i>Salvo'; $('.breadcrumbs .draft-badge').innerHTML = '<i></i>Salvo'; updateUndoButtons();
    }
    catch (error) { state.suppressHistory = false; updateUndoButtons(); $('.saved-state').innerHTML = '<i style="background:#dc7676"></i>Erro ao salvar'; notify(error.message, 'error'); }
  }, 400);
}

function findDefaultStagePosition(nodes = currentGraph(), edges = currentEdges()) {
  const width = canvas.clientWidth || 1000; const height = canvas.clientHeight || 680;
  return findAvailableNodePosition(nodes, edges, { width, height });
}

function addStage(type, position = null) {
  if (!state.workflow) return;
  const defaults = {
    agent: { name: 'Novo agente', config: { runner: state.settings.defaultRunner, model: state.settings.defaultModel, effort: state.settings.defaultEffort, harness: state.settings.defaultRunner, prompt: 'Execute a tarefa descrita no contexto e informe o resultado.', datasetIds: [], skillIds: state.skills.some(skill => skill.id === DEFAULT_KANBAN_SKILL_ID) ? [DEFAULT_KANBAN_SKILL_ID] : [] } },
    subworkflow: { name: 'Novo sub-workflow', children: [], childEdges: [], config: {} },
    approval: { name: 'Nova aprovação', config: { message: 'Revise e aprove para continuar.' } },
    condition: { name: 'Nova condição', config: { contains: '' } },
    integration: { name: 'Nova integração', config: { command: '', requiresApproval: true } }
  };
  const node = { id: `${safeId(defaults[type].name)}-${crypto.randomUUID().slice(0, 6)}`, type, position: position || findDefaultStagePosition(), ...defaults[type] };
  const nodes = currentGraph(); const edges = currentEdges();
  const ordered = graphNodesInOrder(nodes, edges); const last = ordered.at(-1); const index = nodes.indexOf(last);
  nodes.splice(index < 0 ? nodes.length : index, 0, node);
  const inbound = edges.find(edge => edge[1] === last?.id);
  if (inbound) { const prior = inbound[0]; const replaced = edges.filter(edge => edge !== inbound).concat([[prior, node.id], [node.id, last.id]]); if (state.nestedParent) state.nestedParent.childEdges = replaced; else state.workflow.edges = replaced; }
  else if (last) edges.push([last.id, node.id]);
  $('#addMenu').classList.add('hidden'); renderGraph(); selectNode(node.id); scheduleSave();
}

function arrangeCurrentGraph() {
  const nodes = currentGraph();
  if (nodes.length < 2) { canvasNavigation.fit(); return; }
  arrangeNodes(nodes, currentEdges(), { width: canvas.clientWidth || 1000, height: canvas.clientHeight || 680 });
  renderGraph();
  if (state.selected && graphFind(state.selected)) selectNode(state.selected);
  scheduleSave();
  requestAnimationFrame(() => canvasNavigation.fit());
  notify(t('Organizar etapas'));
}

function stageTypeFromPalette(type) {
  return ({ gate: 'approval', workflow: 'subworkflow', deploy: 'integration' })[type] || type;
}
function dropPaletteStage(event, type) {
  const rect = canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return;
  const widthPercent = 215 / canvas.clientWidth * 100; const heightPercent = 79 / canvas.clientHeight * 100;
  const maxX = Math.max(1, 100 - widthPercent - 1); const maxY = Math.max(5, 100 - heightPercent - 1);
  const position = {
    x: Math.max(1, Math.min(maxX, (event.clientX - rect.left) / rect.width * 100 - widthPercent / 2)),
    y: Math.max(5, Math.min(maxY, (event.clientY - rect.top) / rect.height * 100 - heightPercent / 2))
  };
  state.suppressPaletteClickUntil = Date.now() + 700;
  $('#addMenu').classList.add('hidden'); addStage(stageTypeFromPalette(type), position);
}

function deleteSelected() {
  const nodes = currentGraph(); const edges = currentEdges(); const index = nodes.findIndex(node => node.id === state.selected); if (index < 0 || nodes[index].type === 'trigger') return;
  const node = nodes[index]; const parents = edges.filter(edge => edge[1] === node.id).map(edge => edge[0]); const children = edges.filter(edge => edge[0] === node.id).map(edge => edge[1]);
  if (state.nestedParent) { state.nestedParent.children = nodes.filter(item => item.id !== node.id); state.nestedParent.childEdges = edges.filter(edge => edge[0] !== node.id && edge[1] !== node.id); }
  else { state.workflow.nodes = nodes.filter(item => item.id !== node.id); state.workflow.edges = edges.filter(edge => edge[0] !== node.id && edge[1] !== node.id); parents.forEach(parent => children.forEach(child => state.workflow.edges.push([parent, child]))); }
  state.selected = null; renderGraph(); $('#inspector').classList.add('inspector-hidden'); scheduleSave();
}

function openNested(node) {
  state.pendingConnection = null; if (!node.children?.length) { node.children = []; node.childEdges = []; }
  state.nestedStack.push(node); state.nestedParent = node; renderGraph();
  if (node.children[0]) selectNode(node.children[0].id);
  else { state.selected = null; $('#inspector').classList.add('inspector-hidden'); notify('Sub-workflow vazio · adicione a primeira etapa pelo canvas.'); }
}
function navigateNested(depth = 0) {
  const targetDepth = Math.max(0, Math.min(state.nestedStack.length, depth));
  if (targetDepth === state.nestedStack.length) return;
  const priorStack = state.nestedStack; const focusNode = priorStack[targetDepth] || priorStack[targetDepth - 1];
  state.pendingConnection = null; state.nestedStack = priorStack.slice(0, targetDepth); state.nestedParent = state.nestedStack.at(-1) || null; state.selected = focusNode?.id || null;
  renderGraph(); if (state.selected && graphFind(state.selected)) selectNode(state.selected);
}
function closeNested() { navigateNested(Math.max(0, state.nestedStack.length - 1)); }

async function refreshWorkflowCatalog() {
  [state.workflows, state.templates, state.boards] = await Promise.all([api('/api/workflows'), api('/api/workflow-templates'), api('/api/boards')]); $('#workflowCount').textContent = state.workflows.workflows.length; $('#boardCount').textContent = state.boards.length;
  renderWorkflowBoardSelector();
  renderWorkflowTemplates();
  updateWorkspaceSummary();
  renderWorkflowManager();
}
function renderWorkflowBoardSelector() {
  const select = $('#newWorkflowBoard'); if (!select) return;
  const selected = select.value; const empty = document.createElement('option'); empty.value = ''; empty.textContent = state.boards.length ? 'Sem quadro associado' : 'Nenhum quadro cadastrado';
  select.replaceChildren(empty, ...state.boards.map(board => {
    const option = document.createElement('option'); option.value = board.id;
    const workflow = state.workflows.workflows.find(item => item.id === board.workflowId);
    option.textContent = workflow ? `${board.name} · ${workflow.name}` : `${board.name} · sem workflow`;
    return option;
  }));
  select.disabled = !state.boards.length;
  if (selected && state.boards.some(board => board.id === selected)) select.value = selected;
}
function renderWorkflowTemplates() {
  const container = $('#workflowTemplates'); if (!container) return; container.replaceChildren();
  for (const template of state.templates) {
    const button = document.createElement('button'); button.type = 'button'; button.className = `workflow-template-card${template.id === state.selectedTemplateId ? ' selected' : ''}`; button.dataset.workflowTemplate = template.id; button.setAttribute('aria-pressed', String(template.id === state.selectedTemplateId));
    const title = document.createElement('span'); title.className = 'workflow-template-title';
    const icon = document.createElement('i'); icon.textContent = template.id === 'sdlc-standard' ? '⌘' : template.id === 'code-review' ? '✓' : '＋';
    const name = document.createElement('b'); name.textContent = t(template.name); title.append(icon, name);
    if (template.isDefault) { const badge = document.createElement('small'); badge.className = 'template-default-badge'; badge.textContent = t('PADRÃO'); title.append(badge); }
    const description = document.createElement('small'); description.className = 'workflow-template-description'; description.textContent = t(template.description);
    const count = document.createElement('small'); count.className = 'workflow-template-count'; count.textContent = `${template.stageCount} ${t(template.stageCount === 1 ? 'etapa inicial' : 'etapas iniciais')}`;
    button.append(title, description, count); container.append(button);
  }
}
function renderWorkflowManager() {
  const list = $('#workflowManagerList'); if (!list) return; list.replaceChildren();
  for (const item of state.workflows.workflows) {
    const row = document.createElement('div'); row.className = `manager-row${item.id === state.workflow?.id ? ' current' : ''}`;
    const info = document.createElement('span'); info.className = 'manager-row-info';
    const name = document.createElement('b'); name.textContent = item.name;
    const linkedBoard = state.boards.find(board => board.workflowId === item.id);
    const detail = document.createElement('small'); detail.textContent = `${item.nodeCount} etapas${item.id === state.workflows.activeWorkflowId ? ' · ativo' : ''}${linkedBoard ? ` · Quadro: ${linkedBoard.name}` : ''}`;
    info.append(name, detail);
    const actions = document.createElement('span'); actions.className = 'manager-row-actions';
    const open = document.createElement('button'); open.className = 'manager-action'; open.textContent = item.id === state.workflow?.id ? 'Aberto' : 'Abrir'; open.disabled = item.id === state.workflow?.id; open.dataset.openWorkflow = item.id;
    const remove = document.createElement('button'); remove.className = 'manager-action danger'; remove.textContent = 'Excluir'; remove.dataset.deleteWorkflow = item.id;
    actions.append(open, remove); row.append(info, actions); list.append(row);
  }
  if (!state.workflows.workflows.length) list.innerHTML = '<p class="manager-empty">Nenhum workflow cadastrado.</p>';
}
async function showWorkflowManager() {
  try { await refreshWorkflowCatalog(); $('#workflowManagerBackdrop').classList.remove('hidden'); $('#newWorkflowName').focus(); }
  catch (error) { notify(`Não foi possível carregar workflows: ${error.message}`, 'error'); }
}
async function activateWorkflowInEditor(workflowId) {
  try {
    clearTimeout(state.saveTimer);
    if (state.workflow) await api(`/api/workflows/${state.workflow.id}`, { method: 'PUT', body: JSON.stringify(state.workflow) });
    setCurrentWorkflow(await api(`/api/workflows/${workflowId}/activate`, { method: 'POST' })); await refreshWorkflowCatalog();
    renderGraph(); const selected = state.workflow.nodes.find(node => node.type === 'agent') || state.workflow.nodes[0]; if (selected) selectNode(selected.id);
    $('#workflowManagerBackdrop').classList.add('hidden'); notify(`Workflow “${state.workflow.name}” aberto.`);
  } catch (error) { notify(error.message, 'error'); }
}
async function createWorkflow() {
  const name = $('#newWorkflowName').value.trim(); if (!name) { notify('Digite um nome para o workflow.', 'error'); return; }
  const boardId = $('#newWorkflowBoard').value || '';
  const boardName = state.boards.find(board => board.id === boardId)?.name;
  try {
    setCurrentWorkflow(await api('/api/workflows', { method: 'POST', body: JSON.stringify({ name, templateId: state.selectedTemplateId, ...(boardId ? { boardId } : {}) }) })); $('#newWorkflowName').value = ''; $('#newWorkflowBoard').value = ''; await refreshWorkflowCatalog();
    renderGraph(); const selected = state.workflow.nodes.find(node => node.type === 'agent') || state.workflow.nodes[0]; if (selected) selectNode(selected.id);
    $('#workflowManagerBackdrop').classList.add('hidden'); notify(`Workflow “${state.workflow.name}” criado${boardName ? ` e vinculado ao quadro “${boardName}”` : ''}.`);
  } catch (error) { notify(error.message, 'error'); }
}
async function removeWorkflow(workflowId) {
  const workflow = state.workflows.workflows.find(item => item.id === workflowId); if (!workflow || !confirm(`Excluir o workflow “${workflow.name}”?`)) return;
  try {
    const result = await api(`/api/workflows/${workflowId}`, { method: 'DELETE' });
    if (workflowId === state.workflow.id) { setCurrentWorkflow(await api(`/api/workflows/${result.activeWorkflowId}/activate`, { method: 'POST' })); renderGraph(); const selected = state.workflow.nodes.find(node => node.type === 'agent') || state.workflow.nodes[0]; if (selected) selectNode(selected.id); }
    await refreshWorkflowCatalog(); notify('Workflow excluído.');
  } catch (error) { notify(error.message, 'error'); }
}

async function showAgentManager() {
  try { [state.agents, state.datasets, state.skills] = await Promise.all([api('/api/agents'), api('/api/datasets'), api('/api/skills')]); $('#agentCount').textContent = state.agents.length; $('#datasetCount').textContent = state.datasets.length; $('#skillCount').textContent = state.skills.length; updateWorkspaceSummary(); renderAgentManager(); resetAgentForm(); $('#agentManagerBackdrop').classList.remove('hidden'); }
  catch (error) { notify(`Não foi possível carregar os agentes: ${error.message}`, 'error'); }
}
function renderAgentManager() {
  const list = $('#agentManagerList'); list.replaceChildren();
  for (const agent of state.agents) {
    const row = document.createElement('div'); row.className = 'manager-row';
    const info = document.createElement('span'); info.className = 'manager-row-info';
    const name = document.createElement('b'); name.textContent = agent.name;
    const detail = document.createElement('small'); detail.textContent = `${displayRunner(agent.runner)[0]} · ${agent.model} · esforço ${agent.effort}${agent.skillIds?.length ? ` · ${agent.skillIds.length} Skills` : ''}`;
    info.append(name, detail);
    const actions = document.createElement('span'); actions.className = 'manager-row-actions';
    const edit = document.createElement('button'); edit.className = 'manager-action'; edit.textContent = 'Editar'; edit.dataset.editAgent = agent.id;
    const remove = document.createElement('button'); remove.className = 'manager-action danger'; remove.textContent = 'Excluir'; remove.dataset.removeAgent = agent.id;
    actions.append(edit, remove); row.append(info, actions); list.append(row);
  }
  if (!state.agents.length) list.innerHTML = '<p class="manager-empty">Cadastre o primeiro agente para reutilizá-lo nos workflows.</p>';
  if (state.selected && graphFind(state.selected)?.type === 'agent') renderAgentTemplatePicker(graphFind(state.selected).config.agentId || '');
}
function resetAgentForm() {
  $('#agentForm').reset(); $('#agentId').value = ''; $('#agentName').value = ''; $('#agentRunner').value = state.settings.defaultRunner; $('#agentModel').value = state.settings.defaultModel; $('#agentEffort').value = state.settings.defaultEffort; $('#agentPrompt').value = 'Execute a tarefa descrita no contexto, altere somente o necessário e relate o resultado.';
  renderAgentDatasetOptions(); renderAgentSkillOptions(state.skills.some(skill => skill.id === DEFAULT_KANBAN_SKILL_ID) ? [DEFAULT_KANBAN_SKILL_ID] : []);
  const select = $('#agentCredential'); select.replaceChildren(new Option('Usar primeira disponível', ''));
  for (const credential of state.credentials) select.add(new Option(`${credential.label} · ${credential.provider}`, credential.id));
  if (state.runners.find(item => item.id === 'codex')?.oauthAvailable) select.add(new Option('Codex CLI · OAuth desta máquina', 'machine-codex-oauth'));
}
function renderAgentDatasetOptions(selectedIds = []) {
  const select = $('#agentDatasets'); select.replaceChildren();
  if (!state.datasets.length) {
    const empty = new Option('Nenhum dataset cadastrado', ''); empty.disabled = true; select.add(empty); select.disabled = true; return;
  }
  select.disabled = false;
  for (const item of state.datasets) { const option = new Option(`${item.name} · ${Number(item.chars || 0).toLocaleString()} caracteres`, item.id); option.selected = selectedIds.includes(item.id); select.add(option); }
}
function renderAgentSkillOptions(selectedIds = []) {
  const select = $('#agentSkills'); select.replaceChildren();
  if (!state.skills.length) { const empty = new Option('Nenhuma Skill cadastrada', ''); empty.disabled = true; select.add(empty); select.disabled = true; return; }
  select.disabled = false;
  for (const item of state.skills) { const option = new Option(`${item.name}${item.description ? ` · ${item.description}` : ''}`, item.id); option.selected = selectedIds.includes(item.id); select.add(option); }
}
function editAgent(agentId) {
  const agent = state.agents.find(item => item.id === agentId); if (!agent) return; resetAgentForm();
  $('#agentId').value = agent.id; $('#agentName').value = agent.name; $('#agentRunner').value = agent.runner; $('#agentModel').value = agent.model; $('#agentEffort').value = agent.effort; $('#agentPrompt').value = agent.prompt; $('#agentCredential').value = agent.credentialId || ''; renderAgentDatasetOptions(agent.datasetIds || []); renderAgentSkillOptions(agent.skillIds || []);
}
async function saveAgent(event) {
  event.preventDefault();
  const id = $('#agentId').value; const runner = $('#agentRunner').value;
  const agent = { name: $('#agentName').value.trim(), runner, model: $('#agentModel').value.trim(), effort: $('#agentEffort').value, harness: runner, prompt: $('#agentPrompt').value.trim(), datasetIds: [...$('#agentDatasets').selectedOptions].map(option => option.value), skillIds: [...$('#agentSkills').selectedOptions].map(option => option.value), credentialId: $('#agentCredential').value || null };
  try {
    const saved = await api(id ? `/api/agents/${id}` : '/api/agents', { method: id ? 'PUT' : 'POST', body: JSON.stringify(agent) });
    state.agents = await api('/api/agents'); $('#agentCount').textContent = state.agents.length; updateWorkspaceSummary(); renderAgentManager(); editAgent(saved.id); notify(`Agente “${saved.name}” salvo.`);
  } catch (error) { notify(error.message, 'error'); }
}
async function removeAgent(agentId) {
  const agent = state.agents.find(item => item.id === agentId); if (!agent || !confirm(`Excluir o agente cadastrado “${agent.name}”?`)) return;
  try { await api(`/api/agents/${agentId}`, { method: 'DELETE' }); state.agents = await api('/api/agents'); $('#agentCount').textContent = state.agents.length; updateWorkspaceSummary(); renderAgentManager(); resetAgentForm(); notify('Agente removido do cadastro.'); }
  catch (error) { notify(error.message, 'error'); }
}
async function showSkillManager() {
  try { state.skills = await api('/api/skills'); $('#skillCount').textContent = state.skills.length; renderSkillManager(); resetSkillForm(); $('#skillManagerBackdrop').classList.remove('hidden'); }
  catch (error) { notify(`Não foi possível carregar as Skills: ${error.message}`, 'error'); }
}
function renderSkillManager() {
  const list = $('#skillManagerList'); list.replaceChildren();
  for (const skill of state.skills) {
    const row = document.createElement('div'); row.className = 'manager-row'; const info = document.createElement('span'); info.className = 'manager-row-info';
    const name = document.createElement('b'); name.textContent = skill.name;
    if (skill.isDefault || skill.id === DEFAULT_KANBAN_SKILL_ID) { const badge = document.createElement('span'); badge.className = 'default-skill-badge'; badge.textContent = t('Skill padrão'); name.append(' ', badge); }
    const description = document.createElement('small'); description.textContent = skill.description ? skill.id === DEFAULT_KANBAN_SKILL_ID ? t(skill.description) : skill.description : `${skill.instructions.length.toLocaleString()} ${t('caracteres de instruções')}`;
    info.append(name, description); const actions = document.createElement('span'); actions.className = 'manager-row-actions';
    const edit = document.createElement('button'); edit.className = 'manager-action'; edit.textContent = 'Editar'; edit.dataset.editSkill = skill.id;
    const remove = document.createElement('button'); remove.className = 'manager-action danger'; remove.textContent = t('Excluir'); remove.dataset.removeSkill = skill.id;
    if (skill.isDefault || skill.id === DEFAULT_KANBAN_SKILL_ID) { remove.disabled = true; remove.title = t('Esta Skill padrão não pode ser removida.'); }
    actions.append(edit, remove); row.append(info, actions); list.append(row);
  }
  if (!state.skills.length) list.innerHTML = '<p class="manager-empty">Nenhuma Skill cadastrada. Crie instruções reutilizáveis para seus agentes.</p>';
}
function resetSkillForm() { $('#skillForm').reset(); $('#skillId').value = ''; }
function editSkill(skillId) {
  const skill = state.skills.find(item => item.id === skillId); if (!skill) return;
  $('#skillId').value = skill.id; $('#skillName').value = skill.name; $('#skillDescription').value = skill.description || ''; $('#skillInstructions').value = skill.instructions;
}
async function saveSkill(event) {
  event.preventDefault(); const id = $('#skillId').value;
  const skill = { name: $('#skillName').value.trim(), description: $('#skillDescription').value.trim(), instructions: $('#skillInstructions').value.trim() };
  try {
    const saved = await api(id ? `/api/skills/${id}` : '/api/skills', { method: id ? 'PUT' : 'POST', body: JSON.stringify(skill) });
    state.skills = await api('/api/skills'); $('#skillCount').textContent = state.skills.length; renderSkillManager(); editSkill(saved.id);
    const selected = graphFind(state.selected); if (selected?.type === 'agent') renderNodeSkills(selected.config.skillIds || []);
    notify(`Skill “${saved.name}” salva.`);
  } catch (error) { notify(error.message, 'error'); }
}
async function removeSkill(skillId) {
  const skill = state.skills.find(item => item.id === skillId); if (!skill || !confirm(`Excluir a Skill “${skill.name}”?`)) return;
  try {
    await api(`/api/skills/${skillId}`, { method: 'DELETE' }); state.skills = await api('/api/skills'); $('#skillCount').textContent = state.skills.length; renderSkillManager(); resetSkillForm();
    state.agents = await api('/api/agents'); if (state.selected && graphFind(state.selected)?.type === 'agent') renderNodeSkills(graphFind(state.selected).config.skillIds || []);
    notify('Skill removida da biblioteca.');
  } catch (error) { notify(error.message, 'error'); }
}
function renderWorkflowFrameworks() {
  const list = $('#workflowFrameworks'); list.replaceChildren(); const selected = new Set(state.workflow?.execution?.frameworks || []);
  for (const framework of state.frameworks) {
    const label = document.createElement('label'); label.className = 'runtime-framework-option';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = framework.id; checkbox.checked = selected.has(framework.id);
    const copy = document.createElement('span'); const name = document.createElement('b'); name.textContent = framework.name; const description = document.createElement('small'); description.textContent = framework.description;
    const status = document.createElement('small'); status.className = 'framework-state'; status.textContent = framework.installed ? `Disponível · ${framework.version}` : 'Não encontrado na imagem local';
    status.style.color = framework.installed ? '#66d2a5' : '#dfaa62'; copy.append(name, description, status); label.append(checkbox, copy); list.append(label);
  }
  $('#frameworkAvailability').textContent = state.frameworks.length ? `${state.frameworks.filter(item => item.installed).length} de ${state.frameworks.length} toolchains disponíveis na imagem do container. O worker Kubernetes verifica a imagem configurada no início da execução.` : 'Não foi possível consultar toolchains.';
}
async function refreshFrameworkAvailability() {
  try { state.frameworks = (await api('/api/runtime/frameworks')).frameworks; renderWorkflowFrameworks(); }
  catch (error) { $('#frameworkAvailability').textContent = `Falha ao verificar toolchains: ${error.message}`; }
}
async function showWorkflowRuntime() {
  if (!state.workflow) return;
  const execution = state.workflow.execution || { target: state.settings.defaultExecutionTarget || 'container', frameworks: [] };
  $('#workflowExecutionTarget').value = execution.target;
  $('#workflowKubernetesNote').textContent = state.settings.kubernetesImage && state.settings.kubernetesWorkspacePvc
    ? `Kubernetes cria um Job temporário com a imagem ${state.settings.kubernetesImage} e o PVC ${state.settings.kubernetesWorkspacePvc}.`
    : 'Kubernetes cria um Job temporário. Configure kubeconfig, imagem do worker e PVC do workspace em Configurações antes de iniciar.';
  $('#workflowKubernetesNote').classList.toggle('hidden', execution.target !== 'kubernetes');
  renderWorkflowFrameworks(); $('#workflowRuntimeBackdrop').classList.remove('hidden'); await refreshFrameworkAvailability();
}
function saveWorkflowRuntime() {
  state.workflow.execution = { target: $('#workflowExecutionTarget').value, frameworks: $$('#workflowFrameworks input:checked').map(item => item.value) };
  updateWorkflowRuntimeBadge(); scheduleSave(); $('#workflowRuntimeBackdrop').classList.add('hidden');
  notify(`Ambiente salvo no workflow: ${state.workflow.execution.target === 'kubernetes' ? 'Kubernetes' : 'Container Docker'}.`);
}
function setMainPage(page) {
  const kanban = page === 'kanban';
  $('#workflowHeading').classList.toggle('hidden', kanban);
  $('#editorFrame').classList.toggle('hidden', kanban);
  $('#kanbanPage').classList.toggle('hidden', !kanban);
  if (kanban) $('#historyPanel').classList.add('hidden');
  $$('.nav-item').forEach(item => item.classList.remove('active'));
  $(`#${kanban ? 'boardsNav' : 'workflowsNav'}`).classList.add('active');
  $('#runTop').classList.toggle('hidden', kanban);
  $('.breadcrumbs span').textContent = kanban ? 'Quadros Kanban' : 'Workflows';
  $('.breadcrumbs b').textContent = kanban ? (state.boards.find(board => board.id === state.currentBoardId)?.name || 'Quadros') : state.workflow?.name || 'Workflow';
}
function populateWorkflowSelect(select, selectedId) {
  select.replaceChildren(...state.workflows.workflows.map(workflow => { const option = document.createElement('option'); option.value = workflow.id; option.textContent = workflow.name; return option; }));
  if (selectedId && state.workflows.workflows.some(workflow => workflow.id === selectedId)) select.value = selectedId;
}
async function refreshBoards() {
  state.boards = await api('/api/boards');
  $('#boardCount').textContent = state.boards.length;
  $('#boardSelect').replaceChildren(...state.boards.map(board => { const option = document.createElement('option'); option.value = board.id; option.textContent = board.name; return option; }));
  if (!state.boards.some(board => board.id === state.currentBoardId)) state.currentBoardId = state.boards[0]?.id || null;
  if (state.currentBoardId) $('#boardSelect').value = state.currentBoardId;
  renderKanban();
}
function selectedBoard() { return state.boards.find(board => board.id === state.currentBoardId) || null; }
async function showKanban() {
  try {
    state.workflows = await api('/api/workflows');
    await refreshBoards(); setMainPage('kanban');
  } catch (error) { notify(`Não foi possível carregar os quadros: ${error.message}`, 'error'); }
}
function renderKanban() {
  const board = selectedBoard(); const lanes = $('#kanbanLanes'); lanes.replaceChildren();
  $('#configureBoardButton').disabled = !board; $('#deleteBoardButton').disabled = !board; $('#createCardButton').disabled = !board;
  if (!board) {
    $('#boardWorkflowLabel').textContent = 'Nenhum quadro cadastrado. Crie um para começar.';
    const empty = document.createElement('div'); empty.className = 'kanban-empty'; empty.innerHTML = '<b>Seu espaço de trabalho está pronto</b><span>Crie um quadro, associe workflows e organize tarefas em colunas e faixas.</span><button class="done-button" id="createFirstBoard">＋ Criar primeiro quadro</button>'; lanes.append(empty);
    $('#createFirstBoard').addEventListener('click', () => void openBoardSettings()); return;
  }
  const workflowIds = board.workflowIds || [board.workflowId];
  const workflowNames = workflowIds.map(id => state.workflows.workflows.find(item => item.id === id)?.name || 'workflow indisponível');
  $('#boardWorkflowLabel').textContent = 'Workflows: ' + workflowNames.join(', ') + ' · ' + board.cards.length + ' cartão(ões)';
  for (const lane of board.lanes) {
    const row = document.createElement('section'); row.className = 'kanban-lane'; row.style.borderLeftColor = lane.color;
    const laneHeading = document.createElement('div'); laneHeading.className = 'kanban-lane-heading';
    const laneDot = document.createElement('i'); laneDot.style.background = lane.color;
    const laneName = document.createElement('b'); laneName.textContent = lane.name;
    const laneCount = document.createElement('small'); laneCount.textContent = board.cards.filter(card => card.laneId === lane.id).length + ' cartões';
    laneHeading.append(laneDot, laneName, laneCount); row.append(laneHeading);
    const grid = document.createElement('div'); grid.className = 'kanban-grid';
    for (const column of board.columns) {
      const columnEl = document.createElement('section'); columnEl.className = 'kanban-column'; columnEl.style.setProperty('--column-color', column.color);
      const heading = document.createElement('header'); const label = document.createElement('b'); label.textContent = column.name; label.style.setProperty('--column-color', column.color);
      const count = board.cards.filter(card => card.columnId === column.id && card.laneId === lane.id).length; const badge = document.createElement('small'); badge.textContent = count;
      heading.append(label, badge); columnEl.append(heading);
      const zone = document.createElement('div'); zone.className = 'kanban-dropzone'; zone.dataset.columnId = column.id; zone.dataset.laneId = lane.id;
      zone.addEventListener('dragover', event => { event.preventDefault(); zone.classList.add('drop-target'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('drop-target'));
      zone.addEventListener('drop', event => { event.preventDefault(); zone.classList.remove('drop-target'); const cardId = event.dataTransfer.getData('text/plain'); if (cardId) void moveKanbanCard(cardId, column.id, lane.id); });
      for (const card of board.cards.filter(item => item.columnId === column.id && item.laneId === lane.id)) zone.append(createKanbanCard(card, board));
      columnEl.append(zone); grid.append(columnEl);
    }
    row.append(grid); lanes.append(row);
  }
}
function colorTextFor(background) {
  const hex = String(background || '').replace('#', '');
  if (hex.length !== 6) return '#ededf3';
  const channels = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255).map(value => value <= .04045 ? value / 12.92 : Math.pow((value + .055) / 1.055, 2.4));
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2] > .48 ? '#20212b' : '#ffffff';
}
function createKanbanCard(card, board) {
  const element = document.createElement('article'); element.className = 'kanban-card priority-' + card.priority; element.draggable = true;
  const foreground = /^#[0-9a-f]{6}$/i.test(card.color || '') ? colorTextFor(card.color) : '';
  if (foreground) { element.style.backgroundColor = card.color; element.style.color = foreground; }
  element.addEventListener('dragstart', event => { event.dataTransfer.setData('text/plain', card.id); event.dataTransfer.effectAllowed = 'move'; });
  const title = document.createElement('b'); title.className = 'kanban-card-title'; title.textContent = card.title; if (foreground) title.style.color = foreground; title.addEventListener('click', () => openCardEditor(card)); element.append(title);
  if (card.description) { const description = document.createElement('p'); description.className = 'kanban-card-description'; description.textContent = card.description; if (foreground) description.style.color = foreground; element.append(description); }
  const metadata = document.createElement('div'); metadata.className = 'kanban-card-meta'; if (foreground) metadata.style.color = foreground; const priority = document.createElement('span'); priority.textContent = ({ low: 'Baixa', medium: 'Normal', high: 'Alta', urgent: 'Urgente' })[card.priority] || 'Normal'; metadata.append(priority);
  if (card.assignee) { const assignee = document.createElement('span'); assignee.textContent = '◉ ' + card.assignee; metadata.append(assignee); }
  if (card.dueDate) { const due = document.createElement('span'); due.textContent = '◷ ' + new Date(card.dueDate + 'T00:00:00').toLocaleDateString('pt-BR'); metadata.append(due); }
  const workflowName = state.workflows.workflows.find(item => item.id === (card.workflowId || board.workflowId))?.name;
  if (workflowName && workflowName !== state.workflows.workflows.find(item => item.id === board.workflowId)?.name) { const workflowTag = document.createElement('span'); workflowTag.textContent = '⌘ ' + workflowName; metadata.append(workflowTag); }
  element.append(metadata);
  if (card.labels?.length) {
    const labels = document.createElement('div'); labels.className = 'kanban-tags';
    for (const value of card.labels) { const definition = board.labels?.find(item => item.id === value); const tag = document.createElement('span'); tag.textContent = definition?.name || value; if (definition) { tag.style.backgroundColor = definition.color; tag.style.color = colorTextFor(definition.color); } labels.append(tag); }
    element.append(labels);
  }
  const counts = [['◷', card.history?.length || 0], ['▤', card.comments?.length || 0], ['↗', card.relatedCardIds?.length || 0], ['⌕', card.attachments?.length || 0]].filter(item => item[1]);
  if (counts.length) { const indicators = document.createElement('div'); indicators.className = 'kanban-card-indicators'; for (const pair of counts) { const item = document.createElement('span'); item.textContent = pair[0] + ' ' + pair[1]; indicators.append(item); } element.append(indicators); }
  const actions = document.createElement('div'); actions.className = 'kanban-card-actions'; const edit = document.createElement('button'); edit.type = 'button'; edit.title = 'Abrir detalhes do cartão'; edit.textContent = '✎'; edit.addEventListener('click', () => openCardEditor(card)); const run = document.createElement('button'); run.type = 'button'; run.title = 'Executar ' + (workflowName || 'workflow associado'); run.textContent = '▶'; run.addEventListener('click', () => void runKanbanCard(card.id)); actions.append(edit, run); element.append(actions); return element;
}
function boardBuilderRow(kind, item = {}) {
  const row = document.createElement('div'); row.className = 'board-builder-row builder-' + kind; row.dataset.itemId = item.id || '';
  const name = document.createElement('input'); name.type = 'text'; name.required = true; name.maxLength = kind === 'label' ? 50 : 80; name.placeholder = kind === 'field' ? 'Nome do campo' : kind === 'label' ? 'Nome da etiqueta' : kind === 'lane' ? 'Nome da faixa' : 'Nome da coluna'; name.value = item.name || ''; name.dataset.itemName = '';
  row.append(name);
  if (kind === 'field') {
    const type = document.createElement('select'); type.dataset.itemType = ''; for (const pair of [['text', 'Texto'], ['number', 'Número'], ['date', 'Data'], ['select', 'Opções'], ['checkbox', 'Caixa de seleção']]) { const option = document.createElement('option'); option.value = pair[0]; option.textContent = pair[1]; type.append(option); } type.value = item.type || 'text'; row.append(type);
    const options = document.createElement('input'); options.type = 'text'; options.maxLength = 500; options.placeholder = 'Opções separadas por vírgula'; options.value = (item.options || []).join(', '); options.dataset.itemOptions = ''; options.hidden = type.value !== 'select'; type.addEventListener('change', () => { options.hidden = type.value !== 'select'; }); row.append(options);
    const requiredLabel = document.createElement('label'); requiredLabel.className = 'builder-required'; const required = document.createElement('input'); required.type = 'checkbox'; required.checked = item.required === true; required.dataset.itemRequired = ''; requiredLabel.append(required, document.createTextNode('Obrigatório')); row.append(requiredLabel);
  } else {
    const color = document.createElement('input'); color.type = 'color'; color.value = /^#[0-9a-f]{6}$/i.test(item.color || '') ? item.color : (kind === 'column' ? '#8f72ed' : kind === 'lane' ? '#6482de' : '#927cff'); color.dataset.itemColor = ''; color.title = 'Escolher cor'; row.append(color);
  }
  const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'builder-remove'; remove.textContent = '×'; remove.title = 'Remover'; remove.addEventListener('click', () => row.remove()); row.append(remove);
  return row;
}
function renderBoardBuilder(selector, items, kind) {
  $(selector).replaceChildren(...items.map(item => boardBuilderRow(kind, item)));
}
function readBoardBuilder(selector, kind) {
  return $$(selector + ' .board-builder-row').map(row => {
    const name = row.querySelector('[data-item-name]').value.trim(); const id = row.dataset.itemId || safeId(name);
    if (kind === 'field') return { id, name, type: row.querySelector('[data-item-type]').value, options: row.querySelector('[data-item-options]').value.split(',').map(item => item.trim()).filter(Boolean), required: row.querySelector('[data-item-required]').checked };
    return { id, name, color: row.querySelector('[data-item-color]').value };
  });
}
async function openBoardSettings(board = null) {
  state.workflows = await api('/api/workflows');
  const selectedIds = board?.workflowIds || (board?.workflowId ? [board.workflowId] : [state.workflows.activeWorkflowId].filter(Boolean));
  const workflows = $('#boardWorkflows'); workflows.replaceChildren(...state.workflows.workflows.map(workflow => { const option = document.createElement('option'); option.value = workflow.id; option.textContent = workflow.name; option.selected = selectedIds.includes(workflow.id); return option; }));
  $('#boardSettingsTitle').textContent = board ? 'Configurar quadro' : 'Novo quadro'; $('#boardId').value = board?.id || '';
  $('#boardName').value = board?.name || ''; $('#boardDescription').value = board?.description || '';
  renderBoardBuilder('#boardColumnsEditor', board?.columns || [{ id: 'backlog', name: 'Backlog', color: '#7e82a0' }, { id: 'doing', name: 'Em andamento', color: '#8f72ed' }, { id: 'review', name: 'Revisão', color: '#e0a647' }, { id: 'done', name: 'Concluído', color: '#43b78d' }], 'column');
  renderBoardBuilder('#boardLanesEditor', board?.lanes || [{ id: 'general', name: 'Geral', color: '#6482de' }, { id: 'priority', name: 'Prioridade', color: '#df687b' }], 'lane');
  renderBoardBuilder('#boardLabelsEditor', board?.labels || [], 'label');
  renderBoardBuilder('#boardFieldsEditor', board?.customFields || [], 'field');
  setBoardSettingsTab('general');
  $('#boardSettingsBackdrop').classList.remove('hidden');
}
async function saveBoardSettings(event) {
  event.preventDefault();
  const id = $('#boardId').value; const current = state.boards.find(board => board.id === id);
  if (!$('#boardName').value.trim()) { setBoardSettingsTab('general'); $('#boardName').focus(); notify('Informe um nome para o quadro.', 'error'); return; }
  const workflowIds = [...$('#boardWorkflows').selectedOptions].map(option => option.value);
  if (!workflowIds.length) { setBoardSettingsTab('workflows'); $('#boardWorkflows').focus(); notify('Selecione pelo menos um workflow para este quadro.', 'error'); return; }
  const workflowId = current && workflowIds.includes(current.workflowId) ? current.workflowId : workflowIds[0];
  const payload = { name: $('#boardName').value.trim(), description: $('#boardDescription').value.trim(), workflowId, workflowIds, columns: readBoardBuilder('#boardColumnsEditor', 'column'), lanes: readBoardBuilder('#boardLanesEditor', 'lane'), labels: readBoardBuilder('#boardLabelsEditor', 'label'), customFields: readBoardBuilder('#boardFieldsEditor', 'field') };
  try { const board = await api(id ? '/api/boards/' + id : '/api/boards', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) }); state.currentBoardId = board.id; $('#boardSettingsBackdrop').classList.add('hidden'); await refreshBoards(); notify('Quadro “' + board.name + '” salvo.'); }
  catch (error) { notify(error.message, 'error'); }
}
function renderCardEditorContent(card, board) {
  const labels = $('#cardLabelsEditor'); const selectedLabels = new Set(card?.labels || []); labels.replaceChildren();
  const definitions = [...(board.labels || [])];
  for (const legacy of selectedLabels) if (!definitions.some(label => label.id === legacy)) definitions.push({ id: legacy, name: legacy, color: '#927cff' });
  if (!definitions.length) { const hint = document.createElement('small'); hint.className = 'field-hint'; hint.textContent = 'Crie etiquetas nas configurações do quadro para usá-las nos cartões.'; labels.append(hint); }
  for (const definition of definitions) { const label = document.createElement('label'); label.className = 'card-label-choice'; label.style.setProperty('--label-color', definition.color || '#927cff'); const input = document.createElement('input'); input.type = 'checkbox'; input.value = definition.id; input.checked = selectedLabels.has(definition.id); label.append(input, document.createTextNode(definition.name)); labels.append(label); }
  const customFields = $('#cardCustomFields'); customFields.replaceChildren();
  for (const field of board.customFields || []) {
    const wrap = document.createElement('div'); wrap.className = 'card-custom-field'; const label = document.createElement('label'); label.textContent = field.name + (field.required ? ' · obrigatório' : '');
    let input;
    if (field.type === 'select') { input = document.createElement('select'); const empty = document.createElement('option'); empty.value = ''; empty.textContent = 'Escolher'; input.append(empty); for (const value of field.options || []) { const option = document.createElement('option'); option.value = value; option.textContent = value; input.append(option); } }
    else { input = document.createElement('input'); input.type = field.type === 'checkbox' ? 'checkbox' : field.type; if (field.type === 'checkbox') input.checked = card?.customFields?.[field.id] === true; }
    input.dataset.customFieldId = field.id; if (field.required && field.type !== 'checkbox') input.required = true;
    if (field.type !== 'checkbox') input.value = card?.customFields?.[field.id] ?? '';
    label.append(input); wrap.append(label); customFields.append(wrap);
  }
  const relatedSelect = $('#cardRelatedCards'); const existing = new Set(card?.relatedCardIds || []);
  relatedSelect.replaceChildren(...board.cards.filter(item => item.id !== card?.id).map(item => { const option = document.createElement('option'); option.value = item.id; option.textContent = item.title; option.selected = existing.has(item.id); return option; }));
  renderCardHistory(card); renderCardComments(card); renderCardAttachments(card); renderRelatedCardLinks(card, board);
}
function renderCardHistory(card) {
  const list = $('#cardHistoryList'); list.replaceChildren();
  if (!card?.history?.length) { const empty = document.createElement('p'); empty.className = 'card-list-empty'; empty.textContent = 'As alterações deste cartão aparecerão aqui.'; list.append(empty); return; }
  for (const entry of [...card.history].reverse()) { const row = document.createElement('article'); row.className = 'card-activity-item'; const message = document.createElement('b'); message.textContent = entry.message; const time = document.createElement('time'); time.dateTime = entry.createdAt; time.textContent = new Date(entry.createdAt).toLocaleString('pt-BR'); row.append(message, time); list.append(row); }
}
function renderCardComments(card) {
  const list = $('#cardCommentsList'); list.replaceChildren();
  if (!card?.comments?.length) { const empty = document.createElement('p'); empty.className = 'card-list-empty'; empty.textContent = 'Nenhum comentário ainda.'; list.append(empty); return; }
  for (const comment of [...card.comments].reverse()) { const row = document.createElement('article'); row.className = 'card-comment-item'; const header = document.createElement('b'); header.textContent = comment.author || 'Equipe'; const time = document.createElement('time'); time.textContent = new Date(comment.createdAt).toLocaleString('pt-BR'); const body = document.createElement('p'); body.textContent = comment.body; row.append(header, time, body); list.append(row); }
}
function renderCardAttachments(card) {
  const list = $('#cardAttachmentList'); list.replaceChildren();
  for (const attachment of card?.attachments || []) { const row = document.createElement('div'); row.className = 'card-file-item'; const link = document.createElement('a'); link.href = attachment.url; link.textContent = attachment.filename + ' · ' + (attachment.size / 1024).toFixed(0) + ' KB'; link.download = attachment.filename; const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'builder-remove'; remove.textContent = '×'; remove.title = 'Remover arquivo'; remove.addEventListener('click', () => void removeCardAttachment(card.id, attachment.id)); row.append(link, remove); list.append(row); }
}
function renderRelatedCardLinks(card, board) {
  const list = $('#cardRelatedList'); list.replaceChildren();
  const related = (card?.relatedCardIds || []).map(id => board.cards.find(item => item.id === id)).filter(Boolean);
  if (!related.length) { const empty = document.createElement('p'); empty.className = 'card-list-empty'; empty.textContent = 'Nenhum cartão relacionado selecionado.'; list.append(empty); return; }
  for (const item of related) { const button = document.createElement('button'); button.type = 'button'; button.className = 'related-card-link'; button.textContent = '↗ ' + item.title; button.addEventListener('click', () => openCardEditor(item)); list.append(button); }
}
function setCardTab(tabName = 'details') {
  const selected = ['details', 'history', 'comments', 'related'].includes(tabName) ? tabName : 'details';
  $$('#cardTabs [role="tab"]').forEach(tab => { const active = tab.dataset.cardTab === selected; tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1; tab.classList.toggle('selected', active); });
  $$('#cardForm [data-card-panel]').forEach(panel => { panel.hidden = panel.dataset.cardPanel !== selected; });
}
function openCardEditor(card = null, tab = 'details') {
  const board = selectedBoard(); if (!board) return;
  $('#cardModalTitle').textContent = card ? card.title : 'Novo cartão'; $('#cardId').value = card?.id || '';
  $('#cardTitle').value = card?.title || ''; $('#cardDescription').value = card?.description || '';
  $('#cardPriority').value = card?.priority || 'medium'; $('#cardAssignee').value = card?.assignee || '';
  $('#cardDueDate').value = card?.dueDate || ''; $('#cardColor').value = /^#[0-9a-f]{6}$/i.test(card?.color || '') ? card.color : '#302b49'; $('#cardCommentText').value = ''; $('#cardAttachments').value = '';
  const fill = (selector, values, selected) => { $(selector).replaceChildren(...values.map(item => { const option = document.createElement('option'); option.value = item.id; option.textContent = item.name; return option; })); if (selected) $(selector).value = selected; };
  fill('#cardColumn', board.columns, card?.columnId); fill('#cardLane', board.lanes, card?.laneId);
  const workflowIds = board.workflowIds || [board.workflowId]; const workflows = state.workflows.workflows.filter(item => workflowIds.includes(item.id));
  fill('#cardWorkflow', workflows, card?.workflowId || board.workflowId);
  renderCardEditorContent(card, board); setCardTab(tab);
  const saved = Boolean(card?.id);
  $('#deleteCardButton').classList.toggle('hidden', !saved); $('#runCardButton').classList.toggle('hidden', !saved);
  $('#addCardComment').disabled = !saved; $('#cardCommentText').disabled = !saved; $('#cardAttachments').disabled = !saved;
  $('#cardBackdrop').classList.remove('hidden');
}
async function fileToBase64(file) {
  if (file.size > 1024 * 1024) throw new Error('O arquivo “' + file.name + '” excede 1 MB.');
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1] || ''); reader.onerror = () => reject(new Error('Não foi possível ler “' + file.name + '”.')); reader.readAsDataURL(file); });
}
async function saveCard(event) {
  event.preventDefault(); const board = selectedBoard(); if (!board) return;
  const id = $('#cardId').value; const customFields = {};
  $$('[data-custom-field-id]').forEach(input => { customFields[input.dataset.customFieldId] = input.type === 'checkbox' ? input.checked : input.value; });
  const payload = { title: $('#cardTitle').value.trim(), description: $('#cardDescription').value.trim(), workflowId: $('#cardWorkflow').value, columnId: $('#cardColumn').value, laneId: $('#cardLane').value, priority: $('#cardPriority').value, assignee: $('#cardAssignee').value.trim(), labels: $$('#cardLabelsEditor input:checked').map(input => input.value), dueDate: $('#cardDueDate').value, color: $('#cardColor').value, customFields, relatedCardIds: [...$('#cardRelatedCards').selectedOptions].map(option => option.value) };
  try {
    const card = await api(id ? '/api/boards/' + board.id + '/cards/' + id : '/api/boards/' + board.id + '/cards', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
    for (const file of [...$('#cardAttachments').files]) { const data = await fileToBase64(file); await api('/api/boards/' + board.id + '/cards/' + card.id + '/attachments', { method: 'POST', body: JSON.stringify({ filename: file.name, mimeType: file.type, data }) }); }
    $('#cardBackdrop').classList.add('hidden'); await refreshBoards(); notify(id ? 'Cartão atualizado.' : 'Cartão criado.');
  } catch (error) { notify(error.message, 'error'); }
}
async function addCardComment() {
  const board = selectedBoard(); const cardId = $('#cardId').value; const body = $('#cardCommentText').value.trim();
  if (!board || !cardId || !body) { notify('Salve o cartão antes de adicionar comentários.', 'error'); return; }
  try { await api('/api/boards/' + board.id + '/cards/' + cardId + '/comments', { method: 'POST', body: JSON.stringify({ body }) }); await refreshBoards(); const card = selectedBoard()?.cards.find(item => item.id === cardId); if (card) openCardEditor(card, 'comments'); notify('Comentário adicionado.'); }
  catch (error) { notify(error.message, 'error'); }
}
async function removeCardAttachment(cardId, attachmentId) {
  const board = selectedBoard(); if (!board) return;
  try { await api('/api/boards/' + board.id + '/cards/' + cardId + '/attachments/' + attachmentId, { method: 'DELETE' }); await refreshBoards(); const card = selectedBoard()?.cards.find(item => item.id === cardId); if (card) openCardEditor(card); notify('Arquivo removido.'); }
  catch (error) { notify(error.message, 'error'); }
}
async function moveKanbanCard(cardId, columnId, laneId) {
  const board = selectedBoard(); if (!board) return;
  try { await api('/api/boards/' + board.id + '/cards/' + cardId, { method: 'PUT', body: JSON.stringify({ columnId, laneId }) }); await refreshBoards(); }
  catch (error) { notify(error.message, 'error'); }
}
async function runKanbanCard(cardId) {
  const board = selectedBoard(); if (!board) return;
  try {
    const card = board.cards.find(item => item.id === cardId); const run = await api('/api/boards/' + board.id + '/cards/' + cardId + '/run', { method: 'POST' }); state.activeRun = run.id; state.latestRunId = run.id; state.kanbanRunId = run.id;
    $('#kanbanRunControls').classList.remove('hidden'); $('#kanbanRunState').textContent = 'Workflow selecionado: ' + (state.workflows.workflows.find(item => item.id === (card?.workflowId || board.workflowId))?.name || board.name);
    $('#runToast').classList.remove('run-terminal'); $('#runToastTitle').textContent = 'Iniciando workflow'; $('#runToastDetail').textContent = 'Cartão “' + (card?.title || board.name) + '”'; $('#approveRun').classList.add('hidden'); $('#rejectRun').classList.add('hidden'); $('#stopRun').classList.remove('hidden');
    void showRunLogs(run.id); clearInterval(state.pollTimer); state.pollTimer = setInterval(pollRun, 900); await pollRun(); notify('Execução iniciada pelo workflow escolhido no cartão.');
  }
  catch (error) { notify(error.message, 'error'); }
}
async function deleteCurrentBoard() {
  const board = selectedBoard(); if (!board || !confirm('Excluir o quadro “' + board.name + '” e os cartões dele?')) return;
  try { await api('/api/boards/' + board.id, { method: 'DELETE' }); state.currentBoardId = null; await refreshBoards(); notify('Quadro excluído.'); }
  catch (error) { notify(error.message, 'error'); }
}async function showSettings() {
  try {
    state.settings = await api('/api/settings');
    setSettingsTab('general'); $('#settingTheme').value = savedTheme(); $('#settingLanguage').value = getLocale();
    $('#settingRunner').value = state.settings.defaultRunner; $('#settingModel').value = state.settings.defaultModel; $('#settingEffort').value = state.settings.defaultEffort;
    $('#settingAgentTimeout').value = state.settings.agentTimeoutMinutes; $('#settingIntegrationTimeout').value = state.settings.integrationTimeoutMinutes; $('#settingConcurrency').value = state.settings.maxConcurrentRuns;
    $('#settingDefaultExecutionTarget').value = state.settings.defaultExecutionTarget; $('#settingKubeNamespace').value = state.settings.kubernetesNamespace; $('#settingKubeContext').value = state.settings.kubernetesContext; $('#settingKubeconfigPath').value = state.settings.kubernetesKubeconfigPath; $('#settingKubeImage').value = state.settings.kubernetesImage; $('#settingKubePvc').value = state.settings.kubernetesWorkspacePvc; $('#settingKubeSubPath').value = state.settings.kubernetesWorkspaceSubPath;
    $('#settingsRuntimeStatus').textContent = state.runners.map(item => `${item.installed ? '✓' : '○'} ${displayRunner(item.id)[0]}: ${t(item.authenticated ? 'autenticado' : item.installed ? 'credencial pendente' : 'não instalado')}`).join(' · ');
    $('#settingsBackdrop').classList.remove('hidden');
  } catch (error) { notify(`Não foi possível carregar as configurações: ${error.message}`, 'error'); }
}
async function saveSettings(event) {
  event.preventDefault();
  const values = { defaultRunner: $('#settingRunner').value, defaultModel: $('#settingModel').value.trim(), defaultEffort: $('#settingEffort').value, agentTimeoutMinutes: Number($('#settingAgentTimeout').value), integrationTimeoutMinutes: Number($('#settingIntegrationTimeout').value), maxConcurrentRuns: Number($('#settingConcurrency').value), defaultExecutionTarget: $('#settingDefaultExecutionTarget').value, kubernetesNamespace: $('#settingKubeNamespace').value.trim(), kubernetesContext: $('#settingKubeContext').value.trim(), kubernetesKubeconfigPath: $('#settingKubeconfigPath').value.trim(), kubernetesImage: $('#settingKubeImage').value.trim(), kubernetesWorkspacePvc: $('#settingKubePvc').value.trim(), kubernetesWorkspaceSubPath: $('#settingKubeSubPath').value.trim() };
  try { state.settings = await api('/api/settings', { method: 'PUT', body: JSON.stringify(values) }); $('#settingsBackdrop').classList.add('hidden'); notify(t('Configurações salvas. Aplicam-se às novas etapas e execuções.')); }
  catch (error) { notify(error.message, 'error'); }
}
async function showOverview() {
  try {
    const [workflows, agents, datasets, runs] = await Promise.all([api('/api/workflows'), api('/api/agents'), api('/api/datasets'), api('/api/runs')]);
    state.workflows = workflows; state.agents = agents; state.datasets = datasets; state.history = runs;
    $('#workflowCount').textContent = workflows.workflows.length; $('#boardCount').textContent = boards.length; $('#agentCount').textContent = agents.length; $('#datasetCount').textContent = datasets.length; $('#runCount').textContent = runs.length; updateWorkspaceSummary();
    const runtimeLabel = state.workflow.execution?.target === 'kubernetes' ? `Kubernetes · namespace ${state.settings.kubernetesNamespace}` : 'Container Docker local';
    const runtimeFrameworks = (state.workflow.execution?.frameworks || []).map(id => state.frameworks.find(framework => framework.id === id)?.name).filter(Boolean);
    $('#overviewWorkspace').textContent = `${runtimeLabel} · ${state.workspacePath} · workflow ativo: ${state.workflow.name}${runtimeFrameworks.length ? ` · ${runtimeFrameworks.join(', ')}` : ''}`;
    $('#overviewWorkflowCount').textContent = workflows.workflows.length; $('#overviewRunCount').textContent = runs.length; $('#overviewAgentCount').textContent = agents.length; $('#overviewDatasetCount').textContent = datasets.length;
    const installed = state.runners.filter(item => item.installed).length; const authenticated = state.runners.filter(item => item.authenticated).length;
    $('#overviewRuntime').textContent = `${installed} executores instalados · ${authenticated} com credencial disponível · ${state.settings.maxConcurrentRuns} execuções simultâneas`;
    const list = $('#overviewRecentRuns'); list.replaceChildren();
    for (const run of runs.slice(0, 5)) {
      const row = document.createElement('div'); row.className = 'manager-row';
      const info = document.createElement('span'); info.className = 'manager-row-info';
      const name = document.createElement('b'); name.textContent = run.input || 'Execução';
      const detail = document.createElement('small'); detail.textContent = `${run.workflowName || 'Workflow'} · ${new Date(run.createdAt).toLocaleString()} · ${run.status}`;
      info.append(name, detail); row.append(info); list.append(row);
    }
    if (!runs.length) list.innerHTML = '<p class="manager-empty">Ainda não há execuções neste workspace.</p>';
    $('#overviewBackdrop').classList.remove('hidden');
  } catch (error) { notify(`Não foi possível carregar a visão geral: ${error.message}`, 'error'); }
}
async function showDatasetManager() {
  try { state.datasets = await api('/api/datasets'); renderDatasetManager(); $('#datasetCount').textContent = state.datasets.length; updateWorkspaceSummary(); $('#datasetManagerBackdrop').classList.remove('hidden'); }
  catch (error) { notify(`Não foi possível carregar datasets: ${error.message}`, 'error'); }
}
function renderDatasetManager() {
  const list = $('#datasetManagerList'); list.replaceChildren();
  for (const item of state.datasets) {
    const row = document.createElement('div'); row.className = 'manager-row';
    const info = document.createElement('span'); info.className = 'manager-row-info'; const name = document.createElement('b'); name.textContent = item.name;
    const detail = document.createElement('small'); detail.textContent = `${Number(item.chars || 0).toLocaleString()} caracteres · ${new Date(item.createdAt).toLocaleString()}`; info.append(name, detail);
    const remove = document.createElement('button'); remove.className = 'manager-action danger'; remove.textContent = 'Excluir'; remove.dataset.deleteDataset = item.id; row.append(info, remove); list.append(row);
  }
  if (!state.datasets.length) list.innerHTML = '<p class="manager-empty">Nenhum dataset cadastrado. Adicione um arquivo de texto de até 600 KB.</p>';
}
async function deleteDataset(datasetId) {
  try { await api(`/api/datasets/${datasetId}`, { method: 'DELETE' }); state.datasets = await api('/api/datasets'); $('#datasetCount').textContent = state.datasets.length; updateWorkspaceSummary(); renderDatasetManager(); if (state.selected && graphFind(state.selected)?.type === 'agent') renderDatasets(graphFind(state.selected).config.datasetIds || []); notify('Dataset removido.'); }
  catch (error) { notify(error.message, 'error'); }
}

function showCredentialModal() { $('#modalBackdrop').classList.remove('hidden'); renderCredentialList(); }
function hideCredentialModal() { $('#modalBackdrop').classList.add('hidden'); }
function renderCredentialList() {
  const list = $('#credentialList'); list.replaceChildren();
  for (const credential of state.credentials) { const row = document.createElement('div'); row.className = 'saved-credential'; row.innerHTML = '<span><b></b><small></small></span><button title="Excluir conexão">Excluir</button>'; $('b', row).textContent = credential.label; $('small', row).textContent = `${credential.provider} · chave criptografada`; $('button', row).addEventListener('click', async () => { await api(`/api/credentials/${credential.id}`, { method: 'DELETE' }); state.credentials = state.credentials.filter(item => item.id !== credential.id); renderCredentialList(); renderCredentialPicker(graphFind(state.selected)?.config.credentialId); notify('Credencial removida.'); }); list.append(row); }
}

async function saveCredential() {
  const token = $('#credentialToken').value.trim(); const provider = $('#credentialProvider').value; const label = $('#credentialLabel').value.trim() || `${provider} principal`;
  if (!token) { notify('Cole uma API key para salvar.', 'error'); return; }
  try { const result = await api('/api/credentials', { method: 'POST', body: JSON.stringify({ provider, label, token }) }); state.credentials.push(result); $('#credentialToken').value = ''; renderCredentialList(); renderCredentialPicker(result.id); scheduleSave(); hideCredentialModal(); notify('Credencial criptografada e salva.'); }
  catch (error) { notify(error.message, 'error'); }
}

async function addDatasetFile(file, attach = true) {
  if (!file) return;
  if (file.size > 600_000) { notify('O arquivo precisa ter até 600 KB.', 'error'); return; }
  try { const content = await file.text(); const item = await api('/api/datasets', { method: 'POST', body: JSON.stringify({ name: file.name, content }) }); state.datasets.unshift(item); $('#datasetCount').textContent = state.datasets.length; updateWorkspaceSummary(); renderDatasetManager(); if (attach && graphFind(state.selected)?.type === 'agent') { const node = graphFind(state.selected); node.config.datasetIds = [...new Set([...(node.config.datasetIds || []), item.id])]; renderDatasets(node.config.datasetIds); scheduleSave(); notify(`Dataset “${item.name}” anexado à etapa.`); } else notify(`Dataset “${item.name}” cadastrado no workspace.`); }
  catch (error) { notify(error.message, 'error'); }
}

function setHistoryPanel(title, subtitle = '') {
  $('#historyTitle').textContent = title; $('#historySubtitle').textContent = subtitle; $('#historyPanel').classList.remove('hidden');
  if (!title.startsWith('Logs ·')) { $('#historyOpenWorkflow').classList.add('hidden'); $('#historyLiveBadge').hidden = true; $('#historyPanel').classList.remove('is-live'); }
}
function runWasInterrupted(run) { return !!run?.interrupted || /runtime reiniciou antes da conclusão/i.test(run?.error || ''); }
function runStatusLabel(run) { return t(runWasInterrupted(run) ? 'Interrompida após reinício' : ({ queued: 'Na fila', running: 'Executando', waiting_approval: 'Aguardando aprovação', completed: 'Concluído', failed: 'Falhou', cancelled: 'Cancelado' })[run.status] || run.status); }
function logLevelLabel(level) { return ({ success: 'OK', error: 'ERRO', warning: 'AVISO', command: 'COMANDO', output: 'SAÍDA', info: 'INFO' })[level] || 'INFO'; }
function logLevelIcon(level) { return ({ success: '✓', error: '×', warning: '!', command: '›_', output: '↳', info: '·' })[level] || '·'; }
function appendLogEntry(entry, scroll = true) {
  const key = `${entry.at}|${entry.level}|${entry.message}`; if (state.renderedLogKeys.has(key)) return;
  const list = $('#historyList'); const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 48;
  state.renderedLogKeys.add(key);
  const row = document.createElement('div'); row.className = `log-row level-${entry.level || 'info'}`;
  row.dataset.level = entry.level || 'info';
  const time = document.createElement('time'); time.dateTime = entry.at; time.title = new Date(entry.at).toLocaleString(); time.textContent = new Date(entry.at).toLocaleTimeString();
  const level = document.createElement('span'); level.className = 'log-level'; level.textContent = `${logLevelIcon(entry.level)} ${logLevelLabel(entry.level)}`;
  const message = document.createElement('span'); message.className = 'log-message'; message.textContent = entry.message;
  row.append(time, level, message); list.append(row);
  while (list.querySelectorAll('.log-row').length > 300) list.querySelector('.log-row')?.remove();
  if (scroll && nearBottom) list.scrollTop = list.scrollHeight;
}
function renderRunLog(run) {
  state.latestRunId = run.id; state.displayedRun = run;
  if (!state.activeRun || state.activeRun === run.id) state.currentRunSnapshot = run;
  state.renderedLogKeys.clear(); $('#historyList').replaceChildren();
  if (run.log?.length) run.log.forEach(entry => appendLogEntry(entry, false));
  else { const empty = document.createElement('p'); empty.className = 'history-empty'; empty.textContent = 'Aguardando a primeira mensagem do runtime…'; $('#historyList').append(empty); }
  $('#historyList').scrollTop = $('#historyList').scrollHeight;
  setHistoryPanel(`Logs · ${run.workflowName || 'workflow'}`, `${runStatusLabel(run)} · execução ${run.id.slice(0, 8)}`);
  $('#historyLiveBadge').hidden = !(['queued', 'running', 'waiting_approval'].includes(run.status) && run.runtimeActive !== false);
  $('#historyPanel').classList.toggle('is-live', !$('#historyLiveBadge').hidden);
  $('#historyOpenWorkflow').classList.toggle('hidden', !run.workflowId);
  $('#historyOpenWorkflow').textContent = state.workflow?.id === run.workflowId && runWasInterrupted(run) ? 'Ver etapa interrompida ↗' : state.workflow?.id === run.workflowId && ['queued', 'running', 'waiting_approval'].includes(run.status) ? 'Ver etapa ativa ↗' : 'Abrir workflow ↗';
  if (!state.activeRun || state.activeRun === run.id) updateNodeStatuses(run);
}
function connectRunLogStream(runId) {
  if (state.eventSourceId === runId && state.eventSource) return;
  state.eventSource?.close(); state.eventSourceId = runId;
  const stream = new EventSource(`/api/runs/${runId}/events`); state.eventSource = stream;
  stream.addEventListener('snapshot', event => {
    const run = JSON.parse(event.data); renderRunLog(run); updateNodeStatuses(run);
    if (['completed', 'failed', 'cancelled'].includes(run.status)) { stream.close(); if (state.eventSource === stream) { state.eventSource = null; state.eventSourceId = null; } }
  });
  stream.addEventListener('log', event => { const entry = JSON.parse(event.data); if (state.latestRunId === runId) appendLogEntry(entry); });
  stream.addEventListener('state', event => {
    const run = JSON.parse(event.data); if (state.latestRunId === runId) {
      const status = runStatusLabel(run);
      $('#historySubtitle').textContent = `${status} · execução ${run.id.slice(0, 8)}`;
      $('#historyLiveBadge').hidden = !(['queued', 'running', 'waiting_approval'].includes(run.status) && run.runtimeActive !== false);
      $('#historyPanel').classList.toggle('is-live', !$('#historyLiveBadge').hidden);
      $('#historyOpenWorkflow').textContent = state.workflow?.id === run.workflowId && runWasInterrupted(run) ? 'Ver etapa interrompida ↗' : state.workflow?.id === run.workflowId && ['queued', 'running', 'waiting_approval'].includes(run.status) ? 'Ver etapa ativa ↗' : 'Abrir workflow ↗';
      if (state.activeRun === run.id) { state.currentRunSnapshot = run; updateRunToast(run); }
      updateNodeStatuses(run);
    }
    if (['completed', 'failed', 'cancelled'].includes(run.status)) { stream.close(); if (state.eventSource === stream) { state.eventSource = null; state.eventSourceId = null; } }
  });
  stream.onerror = () => { if (state.latestRunId === runId && state.activeRun === runId) $('#historySubtitle').textContent = 'Reconectando ao stream de logs…'; };
}
async function showRunLogs(runOrId) {
  try {
    const run = typeof runOrId === 'string' ? await api(`/api/runs/${runOrId}`) : runOrId;
    renderRunLog(run); $$('.editor-tab').forEach(item => item.classList.remove('selected')); $('#logsTab').classList.add('selected');
    if (runIsLive(run)) connectRunLogStream(run.id);
  } catch (error) { notify(`Não foi possível abrir os logs: ${error.message}`, 'error'); }
}
function findNodeLocation(nodes, nodeId, parents = []) {
  for (const node of nodes || []) {
    if (node.id === nodeId) return { node, parents };
    if (node.type === 'subworkflow') { const found = findNodeLocation(node.children, nodeId, [...parents, node]); if (found) return found; }
  }
  return null;
}
async function openWorkflowForDisplayedRun() {
  const run = state.displayedRun || state.currentRunSnapshot;
  if (!run?.workflowId) return;
  try {
    setMainPage('workflow');
    if (state.workflow.id !== run.workflowId) {
      clearTimeout(state.saveTimer);
      await api(`/api/workflows/${state.workflow.id}`, { method: 'PUT', body: JSON.stringify(state.workflow) });
      setCurrentWorkflow(await api(`/api/workflows/${run.workflowId}`)); await refreshWorkflowCatalog();
    }
    const activeStep = [...(run.steps || [])].reverse().find(step => step.status === 'running' || step.status === 'failed' || step.status === 'completed');
    const located = activeStep && findNodeLocation(state.workflow.nodes, activeStep.nodeId);
    const stack = [];
    let graph = state.workflow.nodes;
    const parentIds = Array.isArray(activeStep?.graphPath) && activeStep.graphPath.length ? activeStep.graphPath : (located?.parents.map(node => node.id) || []);
    for (const parentId of parentIds) {
      const parent = graph.find(node => node.id === parentId);
      if (!parent || parent.type !== 'subworkflow') break;
      stack.push(parent); graph = parent.children || [];
    }
    state.nestedStack = stack; state.nestedParent = stack.at(-1) || null; state.currentRunSnapshot = run;
    renderGraph();
    const focusNode = graphFind(activeStep?.nodeId) || state.nestedParent || state.workflow.nodes[0];
    if (focusNode) selectNode(focusNode.id);
    $('#historyPanel').classList.add('hidden');
  } catch (error) { notify(`Não foi possível abrir o workflow da execução: ${error.message}`, 'error'); }
}
function showRunModal() { $('#runModalBackdrop').classList.remove('hidden'); $('#runInput').focus(); }
function hideRunModal() { $('#runModalBackdrop').classList.add('hidden'); }
function runIsLive(run) { return ['queued', 'running', 'waiting_approval'].includes(run.status) && run.runtimeActive !== false; }
function updateRunToast(run) {
  const activeStep = [...(run.steps || [])].reverse().find(step => step.status === 'running');
  const failedStep = [...(run.steps || [])].reverse().find(step => step.status === 'failed');
  const interruptedStep = runWasInterrupted(run) ? failedStep : null;
  const waiting = run.status === 'waiting_approval'; const terminal = ['completed', 'failed', 'cancelled'].includes(run.status);
  const title = runWasInterrupted(run) ? t('Execução interrompida após reinício') : t(({ queued: 'Na fila de execução', running: 'Workflow em execução', waiting_approval: 'Aprovação necessária', completed: 'Workflow concluído', failed: 'Execução com erro', cancelled: 'Execução cancelada' })[run.status] || 'Execução do workflow');
  const failureReason = localizeError(failedStep?.error || run.error);
  const detail = waiting ? (run.pendingApproval?.message || run.pendingApproval?.name || t('Aprove para continuar.')) : run.status === 'failed' ? `${failedStep?.name || run.workflowName || t('Workflow')}: ${failureReason || t('Falha sem detalhes disponíveis.')}` : `${run.workflowName || t('Workflow')}${activeStep ? ` · ${activeStep.name}` : interruptedStep ? ` · ${t('parou em')} ${interruptedStep.name}` : ''}`;
  $('#runToast').classList.remove('hidden'); $('#runToast').classList.toggle('run-terminal', terminal); $('#runToast').dataset.status = run.status;
  $('#runToastTitle').textContent = title; $('#runToastDetail').textContent = detail;
  $('#runToastDetail').title = run.status === 'failed' ? detail : '';
  const totalSteps = (run.steps || []).length; const completeSteps = (run.steps || []).filter(step => step.status === 'completed').length;
  const progress = run.status === 'completed' ? 100 : totalSteps ? Math.round(completeSteps / totalSteps * 100) : 0;
  $('#runProgress').style.setProperty('--run-progress', `${progress}%`);
  $('#runProgress').classList.toggle('run-progress-failed', run.status === 'failed');
  $('#runProgress').classList.toggle('run-progress-active', runIsLive(run));
  $('#approveRun').classList.toggle('hidden', !waiting); $('#rejectRun').classList.toggle('hidden', !waiting); $('#stopRun').classList.toggle('hidden', !runIsLive(run) || waiting);
  $('.run-top').disabled = runIsLive(run); $('#runFooter').disabled = runIsLive(run);
  $('.run-top span').textContent = runIsLive(run) ? t('Executando') : t('Executar'); $('#runFooter').textContent = runIsLive(run) ? `◌ ${t('Executando')}…` : `▶ ${t('Executar workflow')}`;
}
async function resumeActiveRun(run) {
  state.activeRun = run.id; state.latestRunId = run.id; state.currentRunSnapshot = run;
  state.displayedRun = run; await openWorkflowForDisplayedRun();
  await showRunLogs(run.id); updateRunToast(run);
  clearInterval(state.pollTimer); state.pollTimer = setInterval(() => void pollRun(), 900); await pollRun();
}
async function restoreInterruptedRun(run) {
  state.activeRun = null; state.latestRunId = run.id; state.currentRunSnapshot = run; state.displayedRun = run;
  await openWorkflowForDisplayedRun(); await showRunLogs(run.id); updateRunToast(run);
}
async function startRun() {
  const input = $('#runInput').value.trim(); if (!input) { notify('Descreva a solicitação para os agentes.', 'error'); return; }
  try {
    const response = await api('/api/runs', { method: 'POST', body: JSON.stringify({ input, workflowId: state.workflow.id }) }); state.activeRun = response.id; state.latestRunId = response.id; hideRunModal();
    $('#runToast').classList.remove('run-terminal'); $('#runToastTitle').textContent = 'Iniciando workflow'; $('#runToastDetail').textContent = 'Preparando o runtime…'; $('#approveRun').classList.add('hidden'); $('#rejectRun').classList.add('hidden'); $('#stopRun').classList.remove('hidden');
    $('.run-top span').textContent = 'Executando'; $('#runFooter').textContent = '◌ Executando…'; $('.run-top').disabled = true; $('#runFooter').disabled = true;
    void showRunLogs(response.id); clearInterval(state.pollTimer); state.pollTimer = setInterval(pollRun, 900); await pollRun();
  } catch (error) { notify(`Não foi possível iniciar: ${error.message}`, 'error'); }
}
async function pollRun() {
  if (!state.activeRun) return;
  try {
    const run = await api(`/api/runs/${state.activeRun}`); state.currentRunSnapshot = run; updateRunToast(run);
    if (state.kanbanRunId === run.id) {
      const waiting = run.status === 'waiting_approval';
      $('#kanbanRunControls').classList.toggle('hidden', !runIsLive(run));
      $('#kanbanRunState').textContent = `${runStatusLabel(run)} · ${run.workflowName || 'Workflow'}`;
      $('#kanbanApprove').classList.toggle('hidden', !waiting); $('#kanbanReject').classList.toggle('hidden', !waiting); $('#kanbanStop').classList.toggle('hidden', !runIsLive(run) || waiting);
    }
    updateNodeStatuses(run);
    if (['completed', 'failed', 'cancelled'].includes(run.status)) { clearInterval(state.pollTimer); state.pollTimer = null; state.activeRun = null; if (state.kanbanRunId === run.id) { state.kanbanRunId = null; $('#kanbanRunControls').classList.add('hidden'); } $('#stopRun').classList.add('hidden'); $('.run-top').disabled = false; $('#runFooter').disabled = false; $('.run-top span').textContent = 'Executar'; $('#runFooter').textContent = '▶ Executar workflow'; $('#lastRunText').textContent = run.status === 'completed' ? 'Última execução: concluída' : `Última execução: ${run.status === 'failed' ? 'com erro' : 'cancelada'}`; await refreshHistory(); if (run.status === 'failed') notify(run.error || 'A execução falhou.', 'error'); }
  } catch (error) { clearInterval(state.pollTimer); state.activeRun = null; $('.run-top').disabled = false; $('#runFooter').disabled = false; notify(error.message, 'error'); }
}
function updateNodeStatuses(run) {
  if (!run) return;
  if (!state.activeRun || state.activeRun === run.id) state.currentRunSnapshot = run;
  $$('.flow-node').forEach(node => {
    node.classList.remove('running-node', 'failed-node', 'completed-node');
    $('.run-status', node)?.remove(); $('.run-check', node)?.remove(); $('.node-error-reason', node)?.remove();
    node.removeAttribute('title');
  });
  if (run.workflowId && run.workflowId !== state.workflow?.id) return;
  const currentPath = state.nestedStack.map(node => node.id);
  const pathMatches = path => JSON.stringify(path || []) === JSON.stringify(currentPath);
  const visibleSteps = (run.steps || []).filter(step => pathMatches(step.graphPath));
  $$('.flow-node').forEach(node => {
    const step = [...visibleSteps].reverse().find(item => item.nodeId === node.dataset.node);
    if (!step) return;
    if (step.status === 'running') node.classList.add('running-node');
    else if (step.status === 'failed') node.classList.add('failed-node');
    else if (step.status === 'completed') node.classList.add('completed-node');
    if (['running', 'failed', 'completed'].includes(step.status)) {
      const badge = document.createElement('span'); badge.className = `run-status ${step.status === 'running' ? 'live' : step.status === 'failed' ? 'failed' : 'done'}`;
      badge.textContent = t(step.status === 'running' ? 'EXECUTANDO' : step.status === 'failed' ? 'FALHA' : 'CONCLUÍDO');
      $('.node-kind', node)?.append(' ', badge);
      if (step.status === 'completed') { const check = document.createElement('span'); check.className = 'node-check run-check'; check.textContent = '✓'; node.append(check); }
      if (step.status === 'failed') {
        const reason = localizeError(step.error || run.error || t('Falha sem detalhes disponíveis.'));
        node.title = `${t('Falha')}: ${reason}`;
        node.setAttribute('aria-label', `${$('.node-copy>b', node)?.textContent || step.name}. ${t('Falha')}: ${reason}`);
        const visibleReason = document.createElement('span'); visibleReason.className = 'node-error-reason'; visibleReason.textContent = reason;
        $('.node-copy', node)?.append(visibleReason);
      }
    }
  });
  const stepByNode = new Map(visibleSteps.map(step => [step.nodeId, step]));
  $$('.dynamic-edge', svg).forEach(edge => {
    edge.classList.remove('edge-running', 'edge-failed');
    const fromStatus = stepByNode.get(edge.dataset.from)?.status;
    const toStatus = stepByNode.get(edge.dataset.to)?.status;
    edge.classList.toggle('edge-done', fromStatus === 'completed' && toStatus === 'completed');
    edge.classList.toggle('edge-running', fromStatus === 'completed' && toStatus === 'running');
    edge.classList.toggle('edge-failed', toStatus === 'failed');
  });
}
async function decideRun(decision) { if (!state.activeRun) return; try { await api(`/api/runs/${state.activeRun}/approve`, { method: 'POST', body: JSON.stringify({ decision }) }); $('#approveRun').classList.add('hidden'); $('#rejectRun').classList.add('hidden'); $('#runToastDetail').textContent = decision === 'approve' ? 'Aprovado · continuando workflow…' : 'Rejeição registrada.'; await pollRun(); } catch (error) { notify(error.message, 'error'); } }
async function cancelRun() { if (!state.activeRun) return; try { await api(`/api/runs/${state.activeRun}/cancel`, { method: 'POST' }); } catch (error) { notify(error.message, 'error'); } }

async function refreshHistory() {
  try { state.history = await api('/api/runs'); $('#runCount').textContent = state.history.length; updateWorkspaceSummary(); if (!$('#historyPanel').classList.contains('hidden') && $('#historyTitle').textContent === 'Execuções recentes') renderRunHistoryList(); }
  catch (error) { console.warn(error); }
}
function renderRunHistoryList() {
  const list = $('#historyList'); list.replaceChildren();
  if (!state.history.length) { list.innerHTML = '<p class="history-empty">As execuções aparecerão aqui.</p>'; return; }
  for (const run of state.history) {
    const live = run.runtimeActive && ['queued', 'running', 'waiting_approval'].includes(run.status);
    const row = document.createElement('button'); row.className = `history-item${live ? ' history-item-live' : ''}`;
    const status = document.createElement('span'); status.className = `history-status status-${run.status}`;
    const details = document.createElement('span'); details.className = 'history-copy';
    const name = document.createElement('b'); name.textContent = run.input;
    const runStatus = runStatusLabel(run);
    const subtitle = document.createElement('small'); subtitle.textContent = `${run.workflowName || 'Workflow'} · ${new Date(run.createdAt).toLocaleString()} · ${runStatus}${live ? ' · AO VIVO' : ''} · ${(run.steps || []).length} etapas`;
    const arrow = document.createElement('span'); arrow.className = 'history-arrow'; arrow.textContent = '›';
    details.append(name, subtitle); row.append(status, details, arrow); row.addEventListener('click', () => void showRunLogs(run)); list.append(row);
  }
}
async function renderRunHistory() { await refreshHistory(); setHistoryPanel('Execuções recentes', `${state.history.length} execução(ões) salva(s) neste workspace`); renderRunHistoryList(); }

$('#addStep').addEventListener('click', () => $('#addMenu').classList.toggle('hidden'));
$('#tailAdd').addEventListener('click', () => $('#addMenu').classList.toggle('hidden'));
$('#closeMenu').addEventListener('click', () => $('#addMenu').classList.add('hidden'));
$('#addMenu').addEventListener('dragstart', event => {
  const item = event.target.closest('[data-add]'); if (!item) return;
  event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData('application/x-open-agents-stage', item.dataset.add);
  event.dataTransfer.setData('text/plain', item.dataset.add);
});
$('#addMenu').addEventListener('click', event => { const type = event.target.closest('[data-add]')?.dataset.add; if (type && Date.now() >= state.suppressPaletteClickUntil) addStage(stageTypeFromPalette(type)); });
$('#addMenu').addEventListener('pointerdown', event => {
  const item = event.target.closest('[data-add]'); if (!item || event.button !== 0) return;
  palettePointerDrag = { type: item.dataset.add, startX: event.clientX, startY: event.clientY, active: false };
});
document.addEventListener('pointermove', event => {
  if (!palettePointerDrag) return;
  if (!palettePointerDrag.active && Math.hypot(event.clientX - palettePointerDrag.startX, event.clientY - palettePointerDrag.startY) > 7) palettePointerDrag.active = true;
  if (!palettePointerDrag.active) return;
  const bounds = $('#canvasWrap').getBoundingClientRect();
  $('#canvasWrap').classList.toggle('drag-over', event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom);
});
document.addEventListener('pointerup', event => {
  if (!palettePointerDrag) return;
  const drag = palettePointerDrag; palettePointerDrag = null;
  const bounds = $('#canvasWrap').getBoundingClientRect(); const inside = event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
  $('#canvasWrap').classList.remove('drag-over');
  if (drag.active && inside) { event.preventDefault(); dropPaletteStage(event, drag.type); }
});
document.addEventListener('pointercancel', () => { palettePointerDrag = null; $('#canvasWrap').classList.remove('drag-over'); });
$('#canvasWrap').addEventListener('dragover', event => {
  if (!event.dataTransfer?.types?.includes('application/x-open-agents-stage')) return;
  event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; $('#canvasWrap').classList.add('drag-over');
});
$('#canvasWrap').addEventListener('dragleave', event => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.classList.remove('drag-over'); });
$('#canvasWrap').addEventListener('drop', event => {
  event.preventDefault(); $('#canvasWrap').classList.remove('drag-over');
  const type = event.dataTransfer?.getData('application/x-open-agents-stage'); if (type) dropPaletteStage(event, type);
});
$('#backWorkflow').addEventListener('click', closeNested);
$('#runnerSelect').addEventListener('click', () => $('#runnerOptions').classList.toggle('hidden'));
$('#runnerOptions').addEventListener('click', event => { const button = event.target.closest('[data-runner]'); if (!button) return; const node = graphFind(state.selected); node.config.runner = button.dataset.runner; node.config.harness = button.dataset.runner; node.config.credentialId = null; const model = node.config.runner === 'claude' ? 'sonnet' : 'gpt-6-luna'; node.config.model = model; $('#runnerOptions').classList.add('hidden'); selectNode(node.id); scheduleSave(); });
$('#agentTemplateSelect').addEventListener('change', event => { const node = graphFind(state.selected); if (!node || node.type !== 'agent') return; const agent = state.agents.find(item => item.id === event.target.value); if (!agent) { node.config.agentId = null; scheduleSave(); return; } Object.assign(node.config, { agentId: agent.id, runner: agent.runner, model: agent.model, effort: agent.effort, harness: agent.harness, prompt: agent.prompt, datasetIds: [...(agent.datasetIds || [])], skillIds: [...(agent.skillIds || [])], credentialId: agent.credentialId || null }); renderGraph(); selectNode(node.id); scheduleSave(); notify(`Agente “${agent.name}” aplicado à etapa.`); });
$('#nodeName').addEventListener('input', event => { const node = graphFind(state.selected); if (!node) return; node.name = event.target.value; $('#inspectorNodeName').textContent = node.name; const card = $(`[data-node="${node.id}"] .node-copy>b`); if (card) card.textContent = node.name; scheduleSave(); });
$('#modelSelect').addEventListener('change', event => { graphFind(state.selected).config.model = event.target.value; renderGraph(); selectNode(state.selected); scheduleSave(); });
$('#effortSelect').addEventListener('change', event => { graphFind(state.selected).config.effort = event.target.value; scheduleSave(); });
$('#harnessSelect').addEventListener('change', event => { graphFind(state.selected).config.harness = event.target.value; scheduleSave(); });
$('#promptBox').addEventListener('input', event => { if (graphFind(state.selected)?.config) { graphFind(state.selected).config.prompt = event.target.innerText; scheduleSave(); } });
$('#integrationCommand').addEventListener('input', event => { const node = graphFind(state.selected); if (node) { node.config.command = event.target.value; scheduleSave(); } });
$('#approvalMessage').addEventListener('input', event => { const node = graphFind(state.selected); if (node?.type === 'approval') { node.config.message = event.target.value; scheduleSave(); } });
$('#conditionContains').addEventListener('input', event => { const node = graphFind(state.selected); if (node?.type === 'condition') { node.config.contains = event.target.value; scheduleSave(); } });
$('#credentialSelect').addEventListener('change', event => { updateCredentialCard(event.target.value); scheduleSave(); });
$('#addDataset').addEventListener('click', () => $('#datasetFile').click());
$('#datasetFile').addEventListener('change', event => { addDatasetFile(event.target.files[0]); event.target.value = ''; });
$('#deleteNode').addEventListener('click', deleteSelected);
$('#doneInspector').addEventListener('click', () => $('#inspector').classList.add('inspector-hidden'));
$('.close-inspector').addEventListener('click', () => $('#inspector').classList.add('inspector-hidden'));
$('#manageCredentials').addEventListener('click', showCredentialModal); $('#addCredential').addEventListener('click', showCredentialModal);
$('#modalClose').addEventListener('click', hideCredentialModal); $('#cancelModal').addEventListener('click', hideCredentialModal); $('#saveCredential').addEventListener('click', saveCredential);
$('#modalBackdrop').addEventListener('click', event => { if (event.target === event.currentTarget) hideCredentialModal(); });
$('#runTop').addEventListener('click', showRunModal); $('#runFooter').addEventListener('click', showRunModal); $('#runModalClose').addEventListener('click', hideRunModal); $('#cancelRun').addEventListener('click', hideRunModal); $('#startRun').addEventListener('click', startRun);
$('#runModalBackdrop').addEventListener('click', event => { if (event.target === event.currentTarget) hideRunModal(); });
$('#approveRun').addEventListener('click', () => decideRun('approve')); $('#rejectRun').addEventListener('click', () => decideRun('reject')); $('#stopRun').addEventListener('click', cancelRun);
$('#historyTab').addEventListener('click', renderRunHistory); $('#closeHistory').addEventListener('click', () => $('#historyPanel').classList.add('hidden'));
$('#historyOpenWorkflow').addEventListener('click', () => void openWorkflowForDisplayedRun());
$('#editorTab').addEventListener('click', () => { $('#historyPanel').classList.add('hidden'); $$('.editor-tab').forEach(item => item.classList.remove('selected')); $('#editorTab').classList.add('selected'); });
$('#historyTab').addEventListener('click', () => { $$('.editor-tab').forEach(item => item.classList.remove('selected')); $('#historyTab').classList.add('selected'); });
$('#logsTab').addEventListener('click', async () => { await refreshHistory(); const runId = state.activeRun || state.latestRunId || state.history[0]?.id; if (runId) await showRunLogs(runId); else setHistoryPanel('Logs', 'Ainda não há execuções neste workspace.'); });
$('#nodeConfigTab').addEventListener('click', () => showInspectorTab('config'));
$('#nodeOutputTab').addEventListener('click', async () => { await refreshHistory(); showInspectorTab('output'); });
$('#overviewNav').addEventListener('click', event => { event.preventDefault(); void showOverview(); });
$('#workflowsNav').addEventListener('click', event => { event.preventDefault(); setMainPage('workflow'); void showWorkflowManager(); });
$('#boardsNav').addEventListener('click', event => { event.preventDefault(); void showKanban(); });
$('#agentsNav').addEventListener('click', event => { event.preventDefault(); void showAgentManager(); });
$('#runsNav').addEventListener('click', event => { event.preventDefault(); setMainPage('workflow'); void renderRunHistory(); });
$('#datasetsNav').addEventListener('click', event => { event.preventDefault(); void showDatasetManager(); });
$('#connectionsNav').addEventListener('click', event => { event.preventDefault(); showCredentialModal(); });
$('#settingsNav').addEventListener('click', event => { event.preventDefault(); void showSettings(); });
$('#workspaceActivityLink').addEventListener('click', () => { setMainPage('workflow'); void renderRunHistory(); });
$('#topHistory').addEventListener('click', () => { setMainPage('workflow'); void renderRunHistory(); });
$('#topHelp').addEventListener('click', showWorkflowHelp); $('#canvasHelp').addEventListener('click', showWorkflowHelp);
$('#workflowActions').addEventListener('click', () => void showWorkflowManager());
$('#advancedSettingsLink').addEventListener('click', () => void showSettings());
$('#overviewOpenWorkflows').addEventListener('click', () => { $('#overviewBackdrop').classList.add('hidden'); void showWorkflowManager(); });
$('#overviewOpenRuns').addEventListener('click', () => { $('#overviewBackdrop').classList.add('hidden'); void renderRunHistory(); });
$('#closeOverview').addEventListener('click', () => $('#overviewBackdrop').classList.add('hidden'));
$('#overviewBackdrop').addEventListener('click', event => { if (event.target === event.currentTarget) event.currentTarget.classList.add('hidden'); });
$('#undoBtn').addEventListener('click', () => restoreWorkflowSnapshot('undo'));
$('#redoBtn').addEventListener('click', () => restoreWorkflowSnapshot('redo'));
$('#createWorkflow').addEventListener('click', createWorkflow);
$('#newWorkflowName').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); createWorkflow(); } });
$('#workflowTemplates').addEventListener('click', event => {
  const card = event.target.closest('[data-workflow-template]'); if (!card) return;
  state.selectedTemplateId = card.dataset.workflowTemplate; renderWorkflowTemplates();
});
$('#workflowManagerList').addEventListener('click', event => { const open = event.target.closest('[data-open-workflow]'); const remove = event.target.closest('[data-delete-workflow]'); if (open) void activateWorkflowInEditor(open.dataset.openWorkflow); if (remove) void removeWorkflow(remove.dataset.deleteWorkflow); });
$('#closeWorkflowManager').addEventListener('click', () => $('#workflowManagerBackdrop').classList.add('hidden'));
$('#workflowManagerBackdrop').addEventListener('click', event => { if (event.target === event.currentTarget) event.currentTarget.classList.add('hidden'); });
$('#closeAgentManager').addEventListener('click', () => $('#agentManagerBackdrop').classList.add('hidden'));
$('#agentManagerBackdrop').addEventListener('click', event => { if (event.target === event.currentTarget) event.currentTarget.classList.add('hidden'); });
$('#newAgent').addEventListener('click', resetAgentForm); $('#resetAgentForm').addEventListener('click', resetAgentForm); $('#agentForm').addEventListener('submit', saveAgent);
$('#agentManagerList').addEventListener('click', event => { const edit = event.target.closest('[data-edit-agent]'); const remove = event.target.closest('[data-remove-agent]'); if (edit) editAgent(edit.dataset.editAgent); if (remove) void removeAgent(remove.dataset.removeAgent); });
$('#agentRunner').addEventListener('change', event => { $('#agentModel').value = event.target.value === 'claude' ? 'sonnet' : event.target.value === 'opencode' ? 'openai/gpt-6-luna' : 'gpt-6-luna'; });
$('#closeDatasetManager').addEventListener('click', () => $('#datasetManagerBackdrop').classList.add('hidden'));
$('#datasetManagerBackdrop').addEventListener('click', event => { if (event.target === event.currentTarget) event.currentTarget.classList.add('hidden'); });
$('#uploadDatasetManager').addEventListener('click', () => $('#datasetManagerFile').click());
$('#datasetManagerFile').addEventListener('change', event => { void addDatasetFile(event.target.files[0], false); event.target.value = ''; });
$('#datasetManagerList').addEventListener('click', event => { const remove = event.target.closest('[data-delete-dataset]'); if (remove) void deleteDataset(remove.dataset.deleteDataset); });
$('#closeSettings').addEventListener('click', () => $('#settingsBackdrop').classList.add('hidden'));
$('#cancelSettings').addEventListener('click', () => $('#settingsBackdrop').classList.add('hidden'));
$('#settingsBackdrop').addEventListener('click', event => { if (event.target === event.currentTarget) event.currentTarget.classList.add('hidden'); });
$('#settingsForm').addEventListener('submit', saveSettings);
$('#settingsTabs').addEventListener('click', event => { const tab = event.target.closest('[data-settings-tab]'); if (tab) setSettingsTab(tab.dataset.settingsTab); });
$('#settingsTabs').addEventListener('keydown', event => {
  const tabs = $$('#settingsTabs [role="tab"]'); const current = tabs.indexOf(document.activeElement);
  if (current < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
  setSettingsTab(tabs[next].dataset.settingsTab); tabs[next].focus();
});
$('#settingTheme').addEventListener('change', event => applyTheme(event.target.value, true));
$('#settingLanguage').addEventListener('change', event => { setLocale(event.target.value); applyTheme(savedTheme()); });
$('#skillsNav').addEventListener('click', event => { event.preventDefault(); void showSkillManager(); });
$('#skillsNavInline').addEventListener('click', event => { event.preventDefault(); void showSkillManager(); });
$('#closeSkillManager').addEventListener('click', () => $('#skillManagerBackdrop').classList.add('hidden'));
$('#skillManagerBackdrop').addEventListener('click', event => { if (event.target === event.currentTarget) event.currentTarget.classList.add('hidden'); });
$('#newSkill').addEventListener('click', resetSkillForm);
$('#resetSkillForm').addEventListener('click', resetSkillForm);
$('#skillForm').addEventListener('submit', saveSkill);
$('#skillManagerList').addEventListener('click', event => { const edit = event.target.closest('[data-edit-skill]'); const remove = event.target.closest('[data-remove-skill]'); if (edit) editSkill(edit.dataset.editSkill); if (remove) void removeSkill(remove.dataset.removeSkill); });
$('#workflowRuntimeButton').addEventListener('click', () => void showWorkflowRuntime());
$('#closeWorkflowRuntime').addEventListener('click', () => $('#workflowRuntimeBackdrop').classList.add('hidden'));
$('#workflowRuntimeBackdrop').addEventListener('click', event => { if (event.target === event.currentTarget) event.currentTarget.classList.add('hidden'); });
$('#boardSelect').addEventListener('change', event => { state.currentBoardId = event.target.value || null; renderKanban(); $('.breadcrumbs b').textContent = selectedBoard()?.name || 'Quadros'; });
$('#createBoardButton').addEventListener('click', () => void openBoardSettings());
$('#configureBoardButton').addEventListener('click', () => { const board = selectedBoard(); if (board) void openBoardSettings(board); });
$('#deleteBoardButton').addEventListener('click', () => void deleteCurrentBoard());
$('#createCardButton').addEventListener('click', () => openCardEditor());
$('#boardSettingsForm').addEventListener('submit', saveBoardSettings);
$('#boardSettingsTabs').addEventListener('click', event => { const tab = event.target.closest('[data-board-settings-tab]'); if (tab) setBoardSettingsTab(tab.dataset.boardSettingsTab); });
$('#boardSettingsTabs').addEventListener('keydown', event => {
  const tabs = $$('#boardSettingsTabs [role="tab"]'); const current = tabs.indexOf(document.activeElement);
  if (current < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
  setBoardSettingsTab(tabs[next].dataset.boardSettingsTab); tabs[next].focus();
});
$('#addBoardColumn').addEventListener('click', () => $('#boardColumnsEditor').append(boardBuilderRow('column')));
$('#addBoardLane').addEventListener('click', () => $('#boardLanesEditor').append(boardBuilderRow('lane')));
$('#addBoardLabel').addEventListener('click', () => $('#boardLabelsEditor').append(boardBuilderRow('label')));
$('#addBoardField').addEventListener('click', () => $('#boardFieldsEditor').append(boardBuilderRow('field')));
$('#closeBoardSettings').addEventListener('click', () => $('#boardSettingsBackdrop').classList.add('hidden'));
$('#cancelBoardSettings').addEventListener('click', () => $('#boardSettingsBackdrop').classList.add('hidden'));
$('#boardSettingsBackdrop').addEventListener('click', event => { if (event.target === event.currentTarget) event.currentTarget.classList.add('hidden'); });
$('#cardForm').addEventListener('submit', saveCard);
$('#cardTabs').addEventListener('click', event => { const tab = event.target.closest('[data-card-tab]'); if (tab) setCardTab(tab.dataset.cardTab); });
$('#addCardComment').addEventListener('click', () => void addCardComment());
$('#closeCardModal').addEventListener('click', () => $('#cardBackdrop').classList.add('hidden'));
$('#cardBackdrop').addEventListener('click', event => { if (event.target === event.currentTarget) event.currentTarget.classList.add('hidden'); });
$('#deleteCardButton').addEventListener('click', async () => { const board = selectedBoard(); const id = $('#cardId').value; if (!board || !id || !confirm('Excluir este cartão?')) return; try { await api(`/api/boards/${board.id}/cards/${id}`, { method: 'DELETE' }); $('#cardBackdrop').classList.add('hidden'); await refreshBoards(); notify('Cartão excluído.'); } catch (error) { notify(error.message, 'error'); } });
$('#runCardButton').addEventListener('click', () => { const id = $('#cardId').value; $('#cardBackdrop').classList.add('hidden'); void runKanbanCard(id); });
$('#kanbanApprove').addEventListener('click', () => decideRun('approve'));
$('#kanbanReject').addEventListener('click', () => decideRun('reject'));
$('#kanbanStop').addEventListener('click', cancelRun);
$('#copyMcpEndpoint').addEventListener('click', async () => { try { await navigator.clipboard.writeText(`${location.origin}/mcp`); notify('Endereço MCP copiado.'); } catch { notify(`Endereço MCP: ${location.origin}/mcp`); } });
$('#saveWorkflowRuntime').addEventListener('click', saveWorkflowRuntime);
$('#refreshFrameworks').addEventListener('click', () => void refreshFrameworkAvailability());
$('#runtimeSettingsShortcut').addEventListener('click', async () => { $('#workflowRuntimeBackdrop').classList.add('hidden'); await showSettings(); });
$('#workflowExecutionTarget').addEventListener('change', event => { $('#workflowKubernetesNote').classList.toggle('hidden', event.target.value !== 'kubernetes'); });
$('#settingRunner').addEventListener('change', event => { if (event.target.value === 'claude') $('#settingModel').value = 'sonnet'; else if (event.target.value === 'opencode') $('#settingModel').value = 'openai/gpt-6-luna'; else $('#settingModel').value = 'gpt-6-luna'; });
$('#zoomIn').addEventListener('click', () => canvasNavigation.setZoom(state.zoom + 10)); $('#zoomOut').addEventListener('click', () => canvasNavigation.setZoom(state.zoom - 10));
$('#fitFlow').addEventListener('click', () => canvasNavigation.fit()); $('#fitCanvas').addEventListener('click', () => canvasNavigation.fit());
$('#arrangeCanvas').addEventListener('click', arrangeCurrentGraph);
$('#fullscreenEditor').addEventListener('click', async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('#editorFrame').requestFullscreen(); } catch { notify('O navegador não permitiu expandir o editor.'); } });
$('#workflowActions').setAttribute('aria-label', 'Abrir lista de workflows');
window.addEventListener('fullscreenchange', () => { $('#fullscreenEditor').textContent = document.fullscreenElement ? '↙' : '⛶'; $('#fullscreenEditor').title = document.fullscreenElement ? 'Sair da tela cheia' : 'Expandir editor'; });
$('.edit-title').addEventListener('click', () => { const name = prompt('Nome do workflow', state.workflow.name); if (name?.trim()) { state.workflow.name = name.trim(); renderGraph(); scheduleSave(); } });
$('.share-btn').addEventListener('click', async () => { try { await navigator.clipboard.writeText(location.href); notify('Link copiado para a área de transferência.'); } catch { notify('Compartilhamento local disponível somente neste navegador.'); } });
$('#runnerDocs').addEventListener('click', () => notify('Os runners são instalados dentro do container Open Agents SDLC. O estado mostrado vem da detecção real do runtime.'));
window.addEventListener('resize', () => { svg.replaceChildren(); currentEdges().forEach(([from, to]) => addSvgEdge(from, to)); });

boot();
