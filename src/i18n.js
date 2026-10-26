const LOCALE_KEY = 'open-agents-sdlc-locale';

const messages = {
  'Configurações': { en: 'Settings', es: 'Configuración', 'pt-BR': 'Configurações' },
  'Escolha uma aba para ajustar os padrões gerais, a execução, o Kubernetes ou o tema da interface.': { en: 'Choose a tab to adjust defaults, execution, Kubernetes, or interface preferences.', es: 'Elige una pestaña para ajustar los valores predeterminados, la ejecución, Kubernetes o la interfaz.', 'pt-BR': 'Escolha uma aba para ajustar os padrões gerais, a execução, o Kubernetes ou as preferências da interface.' },
  'Geral': { en: 'General', es: 'General', 'pt-BR': 'Geral' },
  'Runner padrão': { en: 'Default runner', es: 'Runner predeterminado', 'pt-BR': 'Runner padrão' },
  'Esforço padrão': { en: 'Default effort', es: 'Esfuerzo predeterminado', 'pt-BR': 'Esforço padrão' },
  'Baixo': { en: 'Low', es: 'Bajo', 'pt-BR': 'Baixo' },
  'Médio': { en: 'Medium', es: 'Medio', 'pt-BR': 'Médio' },
  'Alto': { en: 'High', es: 'Alto', 'pt-BR': 'Alto' },
  'Muito alto': { en: 'Very high', es: 'Muy alto', 'pt-BR': 'Muito alto' },
  'Máximo': { en: 'Maximum', es: 'Máximo', 'pt-BR': 'Máximo' },
  'Execução': { en: 'Execution', es: 'Ejecución', 'pt-BR': 'Execução' },
  'Ambiente padrão para novos workflows': { en: 'Default environment for new workflows', es: 'Entorno predeterminado para nuevos workflows', 'pt-BR': 'Ambiente padrão para novos workflows' },
  'Container Docker local': { en: 'Local Docker container', es: 'Contenedor Docker local', 'pt-BR': 'Container Docker local' },
  'Cluster Kubernetes': { en: 'Kubernetes cluster', es: 'Clúster de Kubernetes', 'pt-BR': 'Cluster Kubernetes' },
  'Execuções simultâneas': { en: 'Concurrent runs', es: 'Ejecuciones simultáneas', 'pt-BR': 'Execuções simultâneas' },
  'Tempo máximo do agente (min)': { en: 'Agent timeout (min)', es: 'Tiempo máximo del agente (min)', 'pt-BR': 'Tempo máximo do agente (min)' },
  'Tempo máximo da integração (min)': { en: 'Integration timeout (min)', es: 'Tiempo máximo de la integración (min)', 'pt-BR': 'Tempo máximo da integração (min)' },
  'Kubernetes': { en: 'Kubernetes', es: 'Kubernetes', 'pt-BR': 'Kubernetes' },
  'Tema': { en: 'Appearance', es: 'Apariencia', 'pt-BR': 'Tema' },
  'Tema da interface': { en: 'Interface theme', es: 'Tema de la interfaz', 'pt-BR': 'Tema da interface' },
  'Escuro': { en: 'Dark', es: 'Oscuro', 'pt-BR': 'Escuro' },
  'Claro': { en: 'Light', es: 'Claro', 'pt-BR': 'Claro' },
  'A alteração é aplicada imediatamente e fica salva neste navegador.': { en: 'Changes apply immediately and are saved in this browser.', es: 'Los cambios se aplican al instante y se guardan en este navegador.', 'pt-BR': 'A alteração é aplicada imediatamente e fica salva neste navegador.' },
  'Tema aplicado à interface': { en: 'Theme applied to the interface', es: 'Tema aplicado a la interfaz', 'pt-BR': 'Tema aplicado à interface' },
  'Salvar configurações': { en: 'Save settings', es: 'Guardar configuración', 'pt-BR': 'Salvar configurações' },
  'Fechar': { en: 'Close', es: 'Cerrar', 'pt-BR': 'Fechar' },
  'Fechar configurações': { en: 'Close settings', es: 'Cerrar configuración', 'pt-BR': 'Fechar configurações' },
  'Idioma': { en: 'Language', es: 'Idioma', 'pt-BR': 'Idioma' },
  'Idioma da interface': { en: 'Interface language', es: 'Idioma de la interfaz', 'pt-BR': 'Idioma da interface' },
  'Escolha o idioma usado nos menus e mensagens do Open Agents SDLC.': { en: 'Choose the language for Open Agents SDLC menus and messages.', es: 'Elige el idioma de los menús y mensajes de Open Agents SDLC.', 'pt-BR': 'Escolha o idioma usado nos menus e mensagens do Open Agents SDLC.' },
  'English': { en: 'English', es: 'Inglés', 'pt-BR': 'Inglês' },
  'Español': { en: 'Spanish', es: 'Español', 'pt-BR': 'Espanhol' },
  'Português (Brasil)': { en: 'Portuguese (Brazil)', es: 'Portugués (Brasil)', 'pt-BR': 'Português (Brasil)' },
  'Editor': { en: 'Editor', es: 'Editor', 'pt-BR': 'Editor' },
  'Histórico': { en: 'History', es: 'Historial', 'pt-BR': 'Histórico' },
  'Logs': { en: 'Logs', es: 'Registros', 'pt-BR': 'Logs' },
  'Workflows': { en: 'Workflows', es: 'Workflows', 'pt-BR': 'Workflows' },
  'Quadros Kanban': { en: 'Kanban boards', es: 'Tableros Kanban', 'pt-BR': 'Quadros Kanban' },
  'Agentes': { en: 'Agents', es: 'Agentes', 'pt-BR': 'Agentes' },
  'Datasets': { en: 'Datasets', es: 'Datasets', 'pt-BR': 'Datasets' },
  'Configurar etapa': { en: 'Configure stage', es: 'Configurar etapa', 'pt-BR': 'Configurar etapa' },
  'CONFIGURAR ETAPA': { en: 'CONFIGURE STAGE', es: 'CONFIGURAR ETAPA', 'pt-BR': 'CONFIGURAR ETAPA' },
  'CONFIGURAR AGENTE': { en: 'CONFIGURE AGENT', es: 'CONFIGURAR AGENTE', 'pt-BR': 'CONFIGURAR AGENTE' },
  'CONFIGURAR APROVAÇÃO': { en: 'CONFIGURE APPROVAL', es: 'CONFIGURAR APROBACIÓN', 'pt-BR': 'CONFIGURAR APROVAÇÃO' },
  'CONFIGURAR INTEGRAÇÃO': { en: 'CONFIGURE INTEGRATION', es: 'CONFIGURAR INTEGRACIÓN', 'pt-BR': 'CONFIGURAR INTEGRAÇÃO' },
  'CONFIGURAR SUB-WORKFLOW': { en: 'CONFIGURE SUB-WORKFLOW', es: 'CONFIGURAR SUB-WORKFLOW', 'pt-BR': 'CONFIGURAR SUB-WORKFLOW' },
  'CONFIGURAR ETAPA': { en: 'CONFIGURE STAGE', es: 'CONFIGURAR ETAPA', 'pt-BR': 'CONFIGURAR ETAPA' },
  'Configuração': { en: 'Configuration', es: 'Configuración', 'pt-BR': 'Configuração' },
  'Saída': { en: 'Output', es: 'Salida', 'pt-BR': 'Saída' },
  'Nome da etapa': { en: 'Stage name', es: 'Nombre de la etapa', 'pt-BR': 'Nome da etapa' },
  'Agente cadastrado': { en: 'Saved agent', es: 'Agente guardado', 'pt-BR': 'Agente cadastrado' },
  'Skills desta etapa': { en: 'Skills for this stage', es: 'Skills de esta etapa', 'pt-BR': 'Skills desta etapa' },
  'Gerenciar Skills': { en: 'Manage skills', es: 'Administrar skills', 'pt-BR': 'Gerenciar Skills' },
  'Agent runner': { en: 'Agent runner', es: 'Runner del agente', 'pt-BR': 'Agent runner' },
  'Modelo': { en: 'Model', es: 'Modelo', 'pt-BR': 'Modelo' },
  'Esforço': { en: 'Effort', es: 'Esfuerzo', 'pt-BR': 'Esforço' },
  'Prompt': { en: 'Prompt', es: 'Prompt', 'pt-BR': 'Prompt' },
  'Executar workflow': { en: 'Run workflow', es: 'Ejecutar workflow', 'pt-BR': 'Executar workflow' },
  'Executando': { en: 'Running', es: 'En ejecución', 'pt-BR': 'Executando' },
  'EXECUTANDO': { en: 'RUNNING', es: 'EN EJECUCIÓN', 'pt-BR': 'EXECUTANDO' },
  'FALHA': { en: 'FAILED', es: 'FALLÓ', 'pt-BR': 'FALHA' },
  'CONCLUÍDO': { en: 'COMPLETED', es: 'COMPLETADO', 'pt-BR': 'CONCLUÍDO' },
  'Workflow em execução': { en: 'Workflow running', es: 'Workflow en ejecución', 'pt-BR': 'Workflow em execução' },
  'Workflow concluído': { en: 'Workflow completed', es: 'Workflow completado', 'pt-BR': 'Workflow concluído' },
  'Execução com erro': { en: 'Run failed', es: 'Ejecución fallida', 'pt-BR': 'Execução com erro' },
  'Execução cancelada': { en: 'Run cancelled', es: 'Ejecución cancelada', 'pt-BR': 'Execução cancelada' },
  'Na fila de execução': { en: 'Queued to run', es: 'En cola de ejecución', 'pt-BR': 'Na fila de execução' },
  'Aprovação necessária': { en: 'Approval required', es: 'Se requiere aprobación', 'pt-BR': 'Aprovação necessária' },
  'Aprove para continuar.': { en: 'Approve to continue.', es: 'Aprueba para continuar.', 'pt-BR': 'Aprove para continuar.' },
  'Aprovar': { en: 'Approve', es: 'Aprobar', 'pt-BR': 'Aprovar' },
  'Rejeitar': { en: 'Reject', es: 'Rechazar', 'pt-BR': 'Rejeitar' },
  'Parar': { en: 'Stop', es: 'Detener', 'pt-BR': 'Parar' },
  'Parar execução': { en: 'Stop run', es: 'Detener ejecución', 'pt-BR': 'Parar execução' },
  'Iniciando workflow': { en: 'Starting workflow', es: 'Iniciando workflow', 'pt-BR': 'Iniciando workflow' },
  'Preparando o runtime…': { en: 'Preparing the runtime…', es: 'Preparando el entorno…', 'pt-BR': 'Preparando o runtime…' },
  'ÚLTIMA SAÍDA': { en: 'LATEST OUTPUT', es: 'ÚLTIMA SALIDA', 'pt-BR': 'ÚLTIMA SAÍDA' },
  'Esta etapa ainda não tem saída registrada. Execute o workflow para ver o resultado aqui.': { en: 'This stage has no recorded output yet. Run the workflow to see the result here.', es: 'Esta etapa aún no tiene una salida registrada. Ejecuta el workflow para ver el resultado aquí.', 'pt-BR': 'Esta etapa ainda não tem saída registrada. Execute o workflow para ver o resultado aqui.' },
  'Sem saída textual': { en: 'No text output', es: 'Sin salida de texto', 'pt-BR': 'Sem saída textual' },
  'Visualizar fluxo': { en: 'View workflow', es: 'Ver workflow', 'pt-BR': 'Visualizar fluxo' },
  'Organizar etapas': { en: 'Arrange stages', es: 'Organizar etapas', 'pt-BR': 'Organizar etapas' },
  'Adicionar etapa': { en: 'Add stage', es: 'Añadir etapa', 'pt-BR': 'Adicionar etapa' },
  'Enquadrar fluxo': { en: 'Fit workflow', es: 'Ajustar workflow', 'pt-BR': 'Enquadrar fluxo' },
  'Centralizar workflow': { en: 'Center workflow', es: 'Centrar workflow', 'pt-BR': 'Centralizar workflow' },
  'Zoom anterior': { en: 'Zoom out', es: 'Alejar', 'pt-BR': 'Diminuir zoom' },
  'Aumentar zoom': { en: 'Zoom in', es: 'Acercar', 'pt-BR': 'Aumentar zoom' },
  'Voltar ao workflow anterior': { en: 'Back to parent workflow', es: 'Volver al workflow anterior', 'pt-BR': 'Voltar ao workflow anterior' },
  'Abrir workflow': { en: 'Open workflow', es: 'Abrir workflow', 'pt-BR': 'Abrir workflow' },
  'Erro ao salvar': { en: 'Save failed', es: 'Error al guardar', 'pt-BR': 'Erro ao salvar' },
  'Salvando…': { en: 'Saving…', es: 'Guardando…', 'pt-BR': 'Salvando…' },
  'Salvo': { en: 'Saved', es: 'Guardado', 'pt-BR': 'Salvo' },
  'O navegador não permitiu expandir o editor.': { en: 'The browser could not expand the editor.', es: 'El navegador no permitió ampliar el editor.', 'pt-BR': 'O navegador não permitiu expandir o editor.' },
  'Executar': { en: 'Run', es: 'Ejecutar', 'pt-BR': 'Executar' },
  'Sem frameworks extras': { en: 'No extra frameworks', es: 'Sin frameworks adicionales', 'pt-BR': 'Sem frameworks extras' },
  'Cadastre o primeiro agente para reutilizá-lo nos workflows.': { en: 'Add your first agent to reuse it in workflows.', es: 'Crea tu primer agente para reutilizarlo en workflows.', 'pt-BR': 'Cadastre o primeiro agente para reutilizá-lo nos workflows.' },
  'Skill padrão': { en: 'Default skill', es: 'Skill predeterminada', 'pt-BR': 'Skill padrão' },
  'Falha': { en: 'Failure', es: 'Error', 'pt-BR': 'Falha' },
  'Falha sem detalhes disponíveis.': { en: 'Failure details are unavailable.', es: 'No hay detalles del error disponibles.', 'pt-BR': 'Falha sem detalhes disponíveis.' },
  'Execução': { en: 'Run', es: 'Ejecución', 'pt-BR': 'Execução' },
  'parou em': { en: 'stopped at', es: 'se detuvo en', 'pt-BR': 'parou em' },
  'Configurações salvas. Aplicam-se às novas etapas e execuções.': { en: 'Settings saved. They apply to new stages and runs.', es: 'Configuración guardada. Se aplica a nuevas etapas y ejecuciones.', 'pt-BR': 'Configurações salvas. Aplicam-se às novas etapas e execuções.' },
  'Esta Skill padrão não pode ser removida.': { en: 'This default skill cannot be removed.', es: 'Esta skill predeterminada no se puede eliminar.', 'pt-BR': 'Esta Skill padrão não pode ser removida.' },
  'caracteres de instruções': { en: 'characters of instructions', es: 'caracteres de instrucciones', 'pt-BR': 'caracteres de instruções' },
  'Não foi possível conectar ao runtime: ': { en: 'Could not connect to the runtime: ', es: 'No se pudo conectar al entorno: ', 'pt-BR': 'Não foi possível conectar ao runtime: ' },
  'Não foi possível iniciar: ': { en: 'Could not start: ', es: 'No se pudo iniciar: ', 'pt-BR': 'Não foi possível iniciar: ' },
  'Não foi possível carregar as configurações: ': { en: 'Could not load settings: ', es: 'No se pudo cargar la configuración: ', 'pt-BR': 'Não foi possível carregar as configurações: ' },
  'Não foi possível carregar as Skills: ': { en: 'Could not load skills: ', es: 'No se pudieron cargar las skills: ', 'pt-BR': 'Não foi possível carregar as Skills: ' },
  'Execução interrompida após reinício': { en: 'Run interrupted after restart', es: 'Ejecución interrumpida tras reiniciar', 'pt-BR': 'Execução interrompida após reinício' },
  'Workflow': { en: 'Workflow', es: 'Workflow', 'pt-BR': 'Workflow' },
};

const interfaceMessages = [
  ['Open Agents SDLC — Workflows de agentes', 'Open Agents SDLC — Agent workflows', 'Open Agents SDLC — Workflows de agentes'],
  ['Workspace local', 'Local workspace', 'Workspace local'], ['WORKSPACE', 'WORKSPACE', 'WORKSPACE'],
  ['Visão geral', 'Overview', 'Resumen'], ['Execuções', 'Runs', 'Ejecuciones'], ['CONFIGURAÇÃO', 'SETTINGS', 'CONFIGURACIÓN'],
  ['Conexões', 'Connections', 'Conexiones'], ['Atividade local', 'Local activity', 'Actividad local'],
  ['Ver execuções ↗', 'View runs ↗', 'Ver ejecuciones ↗'], ['Rascunho', 'Draft', 'Borrador'], ['Salvo agora', 'Saved just now', 'Guardado ahora'],
  ['Copiar link', 'Copy link', 'Copiar enlace'], ['EDITOR LOCAL', 'LOCAL EDITOR', 'EDITOR LOCAL'],
  ['Da ideia ao deploy, com agentes trabalhando em conjunto.', 'From idea to deployment, with agents working together.', 'De la idea al despliegue, con agentes trabajando juntos.'],
  ['Container', 'Container', 'Contenedor'], ['＋ Novo quadro', '＋ New board', '＋ Nuevo tablero'], ['⚙ Configurar', '⚙ Configure', '⚙ Configurar'],
  ['＋ Cartão', '＋ Card', '＋ Tarjeta'], ['Selecione um quadro para começar', 'Select a board to get started', 'Selecciona un tablero para comenzar'],
  ['MCP Kanban ativo ·', 'Kanban MCP active ·', 'MCP Kanban activo ·'], ['Voltar ao workflow anterior', 'Back to parent workflow', 'Volver al workflow anterior'],
  ['INÍCIO', 'START', 'INICIO'], ['Nova solicitação', 'New request', 'Nueva solicitud'], ['AGENTE DE IA', 'AI AGENT', 'AGENTE DE IA'],
  ['SUCESSO', 'SUCCESS', 'ÉXITO'], ['SUB-WORKFLOW', 'SUB-WORKFLOW', 'SUB-WORKFLOW'], ['PRONTO', 'READY', 'LISTO'],
  ['3 agentes · 5 etapas', '3 agents · 5 stages', '3 agentes · 5 etapas'], ['QA & revisão', 'QA & review', 'QA y revisión'],
  ['APROVAÇÃO HUMANA', 'HUMAN APPROVAL', 'APROBACIÓN HUMANA'], ['Revisar pull request', 'Review pull request', 'Revisar pull request'],
  ['Aguardando aprovação', 'Awaiting approval', 'Esperando aprobación'], ['DEPLOY', 'DEPLOY', 'DESPLIEGUE'],
  ['Publicar em staging', 'Publish to staging', 'Publicar en staging'], ['Arraste tipos para o canvas', 'Drag stage types onto the canvas', 'Arrastra tipos al lienzo'],
  ['Conecte saída à entrada', 'Connect an output to an input', 'Conecta una salida con una entrada'], ['Clique para configurar', 'Click to configure', 'Haz clic para configurar'],
  ['Arraste para o canvas', 'Drag onto the canvas', 'Arrastra al lienzo'], ['Ou clique em um tipo para adicionar', 'Or click a stage type to add it', 'O haz clic en un tipo para añadirlo'],
  ['Executando workflow', 'Workflow running', 'Workflow en ejecución'], ['Iniciando etapa…', 'Starting stage…', 'Iniciando etapa…'],
  ['CONFIGURAR ETAPA', 'CONFIGURE STAGE', 'CONFIGURAR ETAPA'], ['Nome da etapa', 'Stage name', 'Nombre de la etapa'],
  ['Configuração livre', 'Custom configuration', 'Configuración libre'], ['Aplique um agente salvo a esta etapa.', 'Apply a saved agent to this stage.', 'Aplica un agente guardado a esta etapa.'],
  ['As instruções selecionadas são incluídas no prompt desta etapa.', 'Selected instructions are included in this stage prompt.', 'Las instrucciones seleccionadas se incluyen en el prompt de esta etapa.'],
  ['Ver runners ↗', 'View runners ↗', 'Ver runners ↗'], ['Open source · CLI', 'Open source · CLI', 'Código abierto · CLI'],
  ['Agent harness', 'Agent harness', 'Entorno del agente'], ['Runner instalado no container de execução.', 'Runner installed in the execution container.', 'Runner instalado en el contenedor de ejecución.'],
  ['Prompt principal', 'Main prompt', 'Prompt principal'], ['Salvamento automático', 'Automatic saving', 'Guardado automático'],
  ['Dataset de contexto', 'Context datasets', 'Datasets de contexto'], ['＋ Adicionar arquivo', '＋ Add file', '＋ Añadir archivo'],
  ['Nenhum dataset vinculado.', 'No datasets attached.', 'No hay datasets vinculados.'], ['Credenciais', 'Credentials', 'Credenciales'],
  ['Nenhuma credencial selecionada', 'No credential selected', 'No hay credenciales seleccionadas'], ['Adicione uma chave para habilitar o runner.', 'Add a key to enable the runner.', 'Añade una clave para habilitar el runner.'],
  ['Usar primeiro disponível', 'Use first available', 'Usar la primera disponible'], ['＋ Adicionar API key', '＋ Add API key', '＋ Añadir API key'],
  ['Mensagem de aprovação', 'Approval message', 'Mensaje de aprobación'], ['A execução pausa até alguém aprovar ou rejeitar.', 'The run pauses until someone approves or rejects.', 'La ejecución se pausa hasta que alguien apruebe o rechace.'],
  ['Continuar se a saída contiver', 'Continue if output contains', 'Continuar si la salida contiene'], ['A condição compara a saída da etapa anterior.', 'This condition checks the previous stage output.', 'La condición compara la salida de la etapa anterior.'],
  ['Comando de integração', 'Integration command', 'Comando de integración'], ['Executado no workspace depois da aprovação humana.', 'Run in the workspace after human approval.', 'Se ejecuta en el workspace después de la aprobación humana.'],
  ['Limites do runtime', 'Runtime limits', 'Límites del entorno'], ['Modelo padrão, tempo e execuções paralelas', 'Default model, timeouts, and parallel runs', 'Modelo predeterminado, tiempos y ejecuciones en paralelo'],
  ['Conectando ao runtime…', 'Connecting to runtime…', 'Conectando al entorno…'], ['Verificando runners', 'Checking runners', 'Comprobando runners'],
  ['Nenhuma execução', 'No runs yet', 'Aún no hay ejecuciones'], ['▶ Executar workflow', '▶ Run workflow', '▶ Ejecutar workflow'],
  ['CONEXÕES DO WORKSPACE', 'WORKSPACE CONNECTIONS', 'CONEXIONES DEL WORKSPACE'], ['Credenciais e acesso', 'Credentials and access', 'Credenciales y acceso'],
  ['Provedor', 'Provider', 'Proveedor'], ['Nome da conexão', 'Connection name', 'Nombre de la conexión'], ['API key', 'API key', 'API key'],
  ['Servidor MCP Kanban ativo', 'Kanban MCP server active', 'Servidor MCP Kanban activo'], ['Agentes no container podem usar', 'Agents in the container can use', 'Los agentes del contenedor pueden usar'],
  ['Copiar endereço', 'Copy address', 'Copiar dirección'], ['Salvar credencial', 'Save credential', 'Guardar credencial'],
  ['NOVA EXECUÇÃO', 'NEW RUN', 'NUEVA EJECUCIÓN'], ['O que vamos construir?', 'What are we building?', '¿Qué vamos a construir?'],
  ['A solicitação será enviada aos agentes do workflow, em sequência, no workspace montado no container.', 'The request will be sent to workflow agents in sequence in the mounted workspace.', 'La solicitud se enviará a los agentes del workflow, en secuencia, dentro del workspace montado.'],
  ['Workspace ativo:', 'Active workspace:', 'Workspace activo:'], ['Cancelar', 'Cancel', 'Cancelar'], ['▶ Iniciar execução', '▶ Start run', '▶ Iniciar ejecución'],
  ['Execuções recentes', 'Recent runs', 'Ejecuciones recientes'], ['Histórico salvo neste workspace', 'Run history saved in this workspace', 'Historial guardado en este workspace'],
  ['AO VIVO', 'LIVE', 'EN VIVO'], ['Abrir workflow ↗', 'Open workflow ↗', 'Abrir workflow ↗'],
  ['Crie, alterne e mantenha pipelines independentes no mesmo workspace.', 'Create and manage independent pipelines in the same workspace.', 'Crea y administra pipelines independientes en el mismo workspace.'],
  ['Comece com um modelo', 'Start with a template', 'Empieza con una plantilla'], ['O SDLC padrão já vem pronto para configurar e executar.', 'The standard SDLC is ready to configure and run.', 'El SDLC estándar está listo para configurar y ejecutar.'],
  ['Sem quadro associado', 'No board linked', 'Sin tablero asociado'], ['＋ Criar workflow', '＋ Create workflow', '＋ Crear workflow'],
  ['BIBLIOTECA DO WORKSPACE', 'WORKSPACE LIBRARY', 'BIBLIOTECA DEL WORKSPACE'], ['Agentes cadastrados', 'Saved agents', 'Agentes guardados'],
  ['Salve perfis reutilizáveis e aplique-os nas etapas dos workflows.', 'Save reusable profiles and apply them to workflow stages.', 'Guarda perfiles reutilizables y aplícalos a las etapas del workflow.'],
  ['＋ Cadastrar agente', '＋ Add agent', '＋ Crear agente'], ['Credencial', 'Credential', 'Credencial'], ['Datasets de contexto', 'Context datasets', 'Datasets de contexto'],
  ['Selecione um ou mais datasets para aplicar junto com o perfil.', 'Select one or more datasets to apply with this profile.', 'Selecciona uno o más datasets para usar con este perfil.'],
  ['As instruções serão anexadas ao prompt do agente.', 'Instructions will be appended to the agent prompt.', 'Las instrucciones se añadirán al prompt del agente.'],
  ['Prompt do agente', 'Agent prompt', 'Prompt del agente'], ['Limpar', 'Clear', 'Limpiar'], ['Salvar agente', 'Save agent', 'Guardar agente'],
  ['CONTEXTO LOCAL', 'LOCAL CONTEXT', 'CONTEXTO LOCAL'], ['Adicione arquivos de texto para reutilizar como contexto nas etapas de agente.', 'Add text files to reuse as context in agent stages.', 'Añade archivos de texto para reutilizarlos como contexto en etapas de agentes.'],
  ['＋ Adicionar dataset', '＋ Add dataset', '＋ Añadir dataset'], ['Runtime local', 'Local runtime', 'Entorno local'],
  ['Runner, modelo de IA e esforço usados como padrão.', 'Default runner, AI model, and effort.', 'Runner, modelo de IA y esfuerzo predeterminados.'],
  ['Verificando runners…', 'Checking runners…', 'Comprobando runners…'], ['Ambiente e limites aplicados às novas execuções.', 'Environment and limits for new runs.', 'Entorno y límites aplicados a nuevas ejecuciones.'],
  ['Conexão do cluster e armazenamento do workspace.', 'Cluster connection and workspace storage.', 'Conexión del clúster y almacenamiento del workspace.'],
  ['Namespace Kubernetes', 'Kubernetes namespace', 'Espacio de nombres de Kubernetes'], ['Contexto Kubernetes', 'Kubernetes context', 'Contexto de Kubernetes'],
  ['Kubeconfig dentro do container', 'Kubeconfig path in the container', 'Ruta del kubeconfig en el contenedor'], ['Imagem do worker Kubernetes', 'Kubernetes worker image', 'Imagen del worker de Kubernetes'],
  ['PVC do workspace', 'Workspace PVC', 'PVC del workspace'], ['Subpasta no PVC (opcional)', 'Subfolder in PVC (optional)', 'Subcarpeta del PVC (opcional)'],
  ['Monte o kubeconfig em modo somente leitura e prepare um PVC com o código do projeto. Veja o guia no README.', 'Mount kubeconfig as read-only and prepare a PVC with the project files. See the README guide.', 'Monta el kubeconfig en modo de solo lectura y prepara un PVC con el código del proyecto. Consulta la guía del README.'],
  ['Personalize as cores da interface para este navegador.', 'Customize interface colors in this browser.', 'Personaliza los colores de la interfaz en este navegador.'],
  ['Nenhuma Skill cadastrada. Crie instruções reutilizáveis para seus agentes.', 'No skills yet. Create reusable instructions for your agents.', 'Aún no hay skills. Crea instrucciones reutilizables para tus agentes.'],
  ['＋ Cadastrar Skill', '＋ Add skill', '＋ Crear skill'], ['Descrição', 'Description', 'Descripción'], ['Instruções da Skill', 'Skill instructions', 'Instrucciones de la skill'],
  ['Até 30 mil caracteres; as instruções são adicionadas ao prompt quando aplicadas.', 'Up to 30,000 characters; instructions are added to the prompt when assigned.', 'Hasta 30.000 caracteres; las instrucciones se añaden al prompt al asignarlas.'],
  ['Salvar Skill', 'Save skill', 'Guardar skill'], ['KANBAN PERSONALIZÁVEL', 'CUSTOM KANBAN', 'KANBAN PERSONALIZABLE'],
  ['Organize as opções por categoria e salve o quadro quando terminar.', 'Organize options by category and save the board when finished.', 'Organiza las opciones por categoría y guarda el tablero al terminar.'],
  ['Colunas e faixas', 'Columns and lanes', 'Columnas y carriles'], ['Etiquetas e campos', 'Labels and fields', 'Etiquetas y campos'],
  ['Dados gerais', 'General details', 'Datos generales'], ['Defina a identidade e o objetivo deste quadro.', 'Set this board’s name and purpose.', 'Define el nombre y el propósito de este tablero.'],
  ['Nome do quadro', 'Board name', 'Nombre del tablero'], ['Workflows associados', 'Linked workflows', 'Workflows asociados'],
  ['Escolha quais workflows podem ser executados pelos cartões deste quadro.', 'Choose which workflows cards on this board can run.', 'Elige qué workflows pueden ejecutar las tarjetas de este tablero.'],
  ['Use Ctrl no Windows ou Command no Mac para selecionar mais de um workflow. O primeiro será usado como padrão.', 'Use Ctrl on Windows or Command on Mac to select multiple workflows. The first is the default.', 'Usa Ctrl en Windows o Command en Mac para seleccionar varios workflows. El primero será el predeterminado.'],
  ['Estrutura do quadro', 'Board structure', 'Estructura del tablero'], ['Personalize colunas, faixas e suas cores.', 'Customize columns, lanes, and their colors.', 'Personaliza las columnas, los carriles y sus colores.'],
  ['Colunas e cores', 'Columns and colors', 'Columnas y colores'], ['＋ Adicionar coluna', '＋ Add column', '＋ Añadir columna'], ['Faixas', 'Lanes', 'Carriles'],
  ['＋ Adicionar faixa', '＋ Add lane', '＋ Añadir carril'], ['Adicione opções para classificar e descrever os cartões.', 'Add options to classify and describe cards.', 'Añade opciones para clasificar y describir tarjetas.'],
  ['Etiquetas personalizadas', 'Custom labels', 'Etiquetas personalizadas'], ['＋ Criar etiqueta', '＋ Create label', '＋ Crear etiqueta'],
  ['Campos personalizados dos cartões', 'Custom card fields', 'Campos personalizados de tarjetas'], ['＋ Criar campo', '＋ Create field', '＋ Crear campo'],
  ['Tipos disponíveis: texto, número, data, lista de opções e caixa de seleção.', 'Available types: text, number, date, choice list, and checkbox.', 'Tipos disponibles: texto, número, fecha, lista de opciones y casilla de verificación.'],
  ['Salvar quadro', 'Save board', 'Guardar tablero'], ['CARTÃO DO QUADRO', 'BOARD CARD', 'TARJETA DEL TABLERO'], ['Novo cartão', 'New card', 'Nueva tarjeta'],
  ['Detalhes', 'Details', 'Detalles'], ['Comentários', 'Comments', 'Comentarios'], ['Relacionados', 'Related', 'Relacionados'],
  ['Título', 'Title', 'Título'], ['Workflow para execução', 'Workflow to run', 'Workflow para ejecutar'], ['Coluna', 'Column', 'Columna'], ['Faixa', 'Lane', 'Carril'],
  ['Prioridade', 'Priority', 'Prioridad'], ['Baixa', 'Low', 'Baja'], ['Normal', 'Normal', 'Normal'], ['Urgente', 'Urgent', 'Urgente'],
  ['Responsável', 'Assignee', 'Responsable'], ['Prazo', 'Due date', 'Fecha límite'], ['Cor do cartão', 'Card color', 'Color de la tarjeta'],
  ['Etiquetas', 'Labels', 'Etiquetas'], ['Arquivos anexados', 'Attachments', 'Archivos adjuntos'],
  ['Até 1 MB por arquivo. Os arquivos ficam salvos junto aos dados do workspace.', 'Up to 1 MB per file. Files are saved with the workspace data.', 'Hasta 1 MB por archivo. Se guardan junto con los datos del workspace.'],
  ['Alterações, movimentações, arquivos e comentários deste cartão.', 'Changes, moves, files, and comments on this card.', 'Cambios, movimientos, archivos y comentarios de esta tarjeta.'],
  ['Registre decisões e contexto da equipe.', 'Record team decisions and context.', 'Registra decisiones y contexto del equipo.'], ['Novo comentário', 'New comment', 'Nuevo comentario'],
  ['＋ Adicionar comentário', '＋ Add comment', '＋ Añadir comentario'], ['Cartões relacionados', 'Related cards', 'Tarjetas relacionadas'],
  ['Vincule outros cartões deste quadro para acompanhar dependências e contexto.', 'Link other cards on this board to track dependencies and context.', 'Vincula otras tarjetas para seguir dependencias y contexto.'],
  ['Selecione os cartões relacionados', 'Select related cards', 'Selecciona las tarjetas relacionadas'],
  ['Selecione os cartões relacionados', 'Select related cards', 'Selecciona las tarjetas relacionadas'],
  ['AMBIENTE DO WORKFLOW PRINCIPAL', 'MAIN WORKFLOW ENVIRONMENT', 'ENTORNO DEL WORKFLOW PRINCIPAL'],
  ['Execução e frameworks', 'Execution and frameworks', 'Ejecución y frameworks'],
  ['A configuração deste workflow também vale para todos os sub-workflows.', 'These settings also apply to all sub-workflows.', 'Esta configuración también se aplica a todos los sub-workflows.'],
  ['Executar em', 'Run on', 'Ejecutar en'], ['Toolchains embarcados', 'Bundled toolchains', 'Toolchains integrados'],
  ['Verificar disponibilidade', 'Check availability', 'Comprobar disponibilidad'],
  ['Os toolchains selecionados são verificados antes de iniciar o workflow.', 'Selected toolchains are checked before the workflow starts.', 'Los toolchains seleccionados se comprueban antes de iniciar el workflow.'],
  ['Verificando frameworks…', 'Checking frameworks…', 'Comprobando frameworks…'], ['Configurações de Kubernetes', 'Kubernetes settings', 'Configuración de Kubernetes'],
  ['Salvar ambiente', 'Save environment', 'Guardar entorno'], ['STATUS DO WORKSPACE', 'WORKSPACE STATUS', 'ESTADO DEL WORKSPACE'],
  ['Dados locais do runtime.', 'Local runtime data.', 'Datos locales del entorno.'], ['Verificando executores…', 'Checking executors…', 'Comprobando ejecutores…'],
  ['Atividade recente', 'Recent activity', 'Actividad reciente'], ['Abrir workflows', 'Open workflows', 'Abrir workflows'], ['Ver execuções', 'View runs', 'Ver ejecuciones'],
  ['execuções ·', 'runs ·', 'ejecuciones ·'], [' workflows ·', ' workflows ·', ' workflows ·'], [' agentes', ' agents', ' agentes'],
  ['Organize o trabalho por etapa e faixa, com cada quadro ligado a um workflow executável.', 'Organize work by stage and lane, with each board connected to an executable workflow.', 'Organiza el trabajo por etapa y carril, con cada tablero conectado a un workflow ejecutable.'],
  ['Aprovação humana', 'Human approval', 'Aprobación humana'], ['Pause para uma decisão', 'Pause for a decision', 'Pausa para una decisión'],
  ['Direcione por critérios', 'Route by criteria', 'Dirige según criterios'], ['Conecte uma ferramenta externa', 'Connect an external tool', 'Conecta una herramienta externa'],
  ['Pausa para revisão humana', 'Pause for human review', 'Pausa para revisión humana'], ['INTEGRAÇÃO', 'INTEGRATION', 'INTEGRACIÓN'],
  ['Modelo padrão', 'Default model', 'Modelo predeterminado'], ['autenticado', 'authenticated', 'autenticado'],
  ['credencial pendente', 'credential needed', 'credencial pendiente'], ['não instalado', 'not installed', 'no instalado'],
  ['Instalado', 'Installed', 'Instalado'], ['Nenhuma execução', 'No runs yet', 'Aún no hay ejecuciones'],
  ['A preferência é aplicada imediatamente e fica salva neste navegador. O idioma inicial é inglês.', 'The preference applies immediately and is saved in this browser. English is the default language.', 'La preferencia se aplica al instante y se guarda en este navegador. El idioma predeterminado es inglés.'],
  ['Organize as opções por categoria e salve o quadro quando terminar.', 'Organize the options by category and save the board when finished.', 'Organiza las opciones por categoría y guarda el tablero al terminar.'],
  ['Título', 'Title', 'Título'], ['Excluir etapa', 'Delete stage', 'Eliminar etapa'], ['Concluído', 'Done', 'Listo'],
  ['Histórico de execuções', 'Run history', 'Historial de ejecuciones'], ['Ajuda', 'Help', 'Ayuda'], ['Como editar o workflow', 'How to edit a workflow', 'Cómo editar un workflow'],
  ['Expandir editor', 'Expand editor', 'Ampliar editor'], ['Sair da tela cheia', 'Exit full screen', 'Salir de pantalla completa'], ['Fechar painel', 'Close panel', 'Cerrar panel'],
  ['Conectar entrada da etapa', 'Connect stage input', 'Conectar entrada de etapa'], ['Conectar saída da etapa', 'Connect stage output', 'Conectar salida de etapa'],
  ['Arrastar agente de IA', 'Drag AI agent', 'Arrastrar agente de IA'], ['Arrastar sub-workflow', 'Drag sub-workflow', 'Arrastrar sub-workflow'],
  ['Arrastar aprovação humana', 'Drag human approval', 'Arrastrar aprobación humana'], ['Arrastar condição', 'Drag condition', 'Arrastrar condición'], ['Arrastar integração', 'Drag integration', 'Arrastrar integración'],
  ['Entrada manual', 'Manual input', 'Entrada manual'], ['Cadastre o primeiro agente para reutilizá-lo nos workflows.', 'Add your first agent to reuse in workflows.', 'Crea tu primer agente para reutilizarlo en los workflows.'],
  ['Atualize a biblioteca e tente novamente.', 'Refresh the library and try again.', 'Actualiza la biblioteca y vuelve a intentarlo.'],
  ['APROVAÇÃO HUMANA', 'HUMAN APPROVAL', 'APROBACIÓN HUMANA'], ['CONDIÇÃO', 'CONDITION', 'CONDICIÓN'],
  ['Condição', 'Condition', 'Condición'], ['Integração', 'Integration', 'Integración'],
  ['Execução interrompida porque o runtime reiniciou antes da conclusão.', 'Run interrupted because the runtime restarted before it finished.', 'La ejecución se interrumpió porque el entorno se reinició antes de finalizar.'],
  ['Revisar pull request: Execução interrompida porque o runtime reiniciou antes da conclusão.', 'Review pull request: Run interrupted because the runtime restarted before it finished.', 'Revisar pull request: La ejecución se interrumpió porque el entorno se reinició antes de finalizar.'],
  ['Ensina a consultar e operar quadros e cartões pelo servidor MCP do Open Agents SDLC.', 'Teaches agents how to read and manage boards and cards through the Open Agents SDLC MCP server.', 'Enseña a consultar y administrar tableros y tarjetas mediante el servidor MCP de Open Agents SDLC.'],
  ['Sessão desta máquina montada somente para leitura.', 'This machine’s session is mounted read-only.', 'La sesión de este equipo está montada en modo de solo lectura.'],
  ['Codex CLI · OAuth desta máquina', 'Codex CLI · this machine’s OAuth', 'Codex CLI · OAuth de este equipo'],
  ['3 runners disponíveis', '3 runners available', '3 runners disponibles'], ['runners disponíveis', 'runners available', 'runners disponibles'],
  ['Adicione uma API key. O valor é criptografado no volume persistente e nunca é devolvido pela API.', 'Add an API key. It is encrypted in persistent storage and never returned by the API.', 'Añade una API key. Se cifra en el almacenamiento persistente y la API nunca la devuelve.'],
  ['SDLC padrão', 'Standard SDLC', 'SDLC estándar'], ['PADRÃO', 'DEFAULT', 'PREDETERMINADO'],
  ['Pipeline completo com planejamento, implementação, QA, aprovação e publicação.', 'Complete pipeline for planning, implementation, QA, approval, and release.', 'Pipeline completo para planificación, implementación, QA, aprobación y publicación.'],
  ['Começar do zero', 'Start from scratch', 'Empezar desde cero'], ['Canvas limpo com uma entrada pronta para receber suas etapas.', 'A clean canvas with an input ready for your stages.', 'Un lienzo vacío con una entrada lista para añadir etapas.'],
  ['Revisão de código', 'Code review', 'Revisión de código'], ['Analise mudanças com um agente e aguarde aprovação humana.', 'Review changes with an agent and wait for human approval.', 'Analiza cambios con un agente y espera la aprobación humana.'],
  ['etapa inicial', 'starting stage', 'etapa inicial'], ['etapas iniciais', 'starting stages', 'etapas iniciales'],
  ['Workflow em branco', 'Blank workflow', 'Workflow en blanco'], ['Na fila', 'Queued', 'En cola'], ['Aguardando aprovação', 'Waiting for approval', 'Esperando aprobación'],
  ['Concluído', 'Completed', 'Completado'], ['Falhou', 'Failed', 'Falló'], ['Cancelado', 'Cancelled', 'Cancelado'],
  ['Interrompida após reinício', 'Interrupted after restart', 'Interrumpida tras reiniciar'],
  ['Use Ctrl no Windows ou Command no Mac para selecionar mais de um cartão.', 'Use Ctrl on Windows or Command on Mac to select multiple cards.', 'Usa Ctrl en Windows o Command en Mac para seleccionar varias tarjetas.'],
  ['Salvar cartão', 'Save card', 'Guardar tarjeta'],
  ['Kubernetes cria um Job temporário e monta o PVC do workspace configurado nas Configurações.', 'Kubernetes creates a temporary Job and mounts the workspace PVC configured in Settings.', 'Kubernetes crea un Job temporal y monta el PVC del workspace configurado en Settings.'],
  ['Usar primeira disponível', 'Use first available', 'Usar la primera disponible'], ['Cadastre instruções especializadas e aplique-as a agentes ou etapas de workflow.', 'Add specialized instructions and assign them to agents or workflow stages.', 'Crea instrucciones especializadas y asígnalas a agentes o etapas del workflow.'],
];
Object.assign(messages, Object.fromEntries(interfaceMessages.map(([source, en, es]) => [source, { en, es, 'pt-BR': source }])));

let locale = readLocale();
const originalText = new WeakMap();
const renderedText = new WeakMap();
const originalAttributes = new WeakMap();
const renderedAttributes = new WeakMap();
let observer;
let translating = false;

function normalizeLocale(value) { return ['en', 'es', 'pt-BR'].includes(value) ? value : 'en'; }
function readLocale() {
  try { return normalizeLocale(localStorage.getItem(LOCALE_KEY)); } catch { return 'en'; }
}
export function getLocale() { return locale; }
export function t(key) { return messages[key]?.[locale] || key; }

function localized(original) {
  const exact = messages[original];
  if (exact) return exact[locale];
  for (const [source, variants] of Object.entries(messages)) {
    if (variants[locale] === original) return original;
    if (variants.en === original || variants.es === original || variants['pt-BR'] === original) return variants[locale];
  }
  return original;
}

function translateTextNode(node) {
  let source = originalText.get(node);
  if (source === undefined || (renderedText.has(node) && node.data !== renderedText.get(node))) {
    source = node.data;
    originalText.set(node, source);
  }
  if (!source.trim()) { renderedText.set(node, source); return; }
  const leading = source.match(/^\s*/)?.[0] || '';
  const trailing = source.match(/\s*$/)?.[0] || '';
  const content = source.slice(leading.length, source.length - trailing.length || undefined);
  const result = `${leading}${localized(content)}${trailing}`;
  if (node.data !== result) {
    translating = true;
    node.data = result;
    renderedText.set(node, result);
    translating = false;
  } else renderedText.set(node, result);
}

function translateAttribute(element, name) {
  const key = `${name}`;
  let originals = originalAttributes.get(element);
  if (!originals) { originals = new Map(); originalAttributes.set(element, originals); }
  let rendered = renderedAttributes.get(element);
  if (!rendered) { rendered = new Map(); renderedAttributes.set(element, rendered); }
  const current = element.getAttribute(key);
  if (current == null) return;
  let source = originals.get(key);
  if (source === undefined || (rendered.has(key) && current !== rendered.get(key))) {
    source = current;
    originals.set(key, source);
  }
  const result = localized(source);
  if (current !== result) {
    translating = true;
    element.setAttribute(key, result);
    rendered.set(key, result);
    translating = false;
  } else rendered.set(key, result);
}

function translateElement(element) {
  for (const attribute of ['title', 'placeholder', 'aria-label']) translateAttribute(element, attribute);
  if (element.childNodes.length === 1 && element.firstChild.nodeType === Node.TEXT_NODE) translateTextNode(element.firstChild);
}

function scan(root = document) {
  if (root.nodeType === Node.TEXT_NODE) { translateTextNode(root); return; }
  if (root.nodeType !== Node.ELEMENT_NODE && root !== document) return;
  if (root.nodeType === Node.ELEMENT_NODE) translateElement(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) translateTextNode(node);
  if (root.querySelectorAll) root.querySelectorAll('*').forEach(translateElement);
}

export function setLocale(value, persist = true) {
  locale = normalizeLocale(value);
  document.documentElement.lang = locale === 'pt-BR' ? 'pt-BR' : locale;
  if (persist) { try { localStorage.setItem(LOCALE_KEY, locale); } catch { /* The language remains active until this page closes. */ } }
  if (observer) observer.disconnect();
  scan(document);
  if (!observer && document.body) {
    observer = new MutationObserver(records => {
      if (translating) return;
      for (const record of records) {
        if (record.type === 'characterData') translateTextNode(record.target);
        else {
          record.addedNodes.forEach(node => scan(node));
          if (record.type === 'attributes') translateAttribute(record.target, record.attributeName);
        }
      }
    });
  }
  observer?.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['title', 'placeholder', 'aria-label'] });
}

export function localizeError(message) {
  const source = String(message || '');
  const exact = messages[source];
  if (exact) return exact[locale];
  const fragments = Object.keys(messages).filter(key => key.length > 6 && source.includes(key)).sort((a, b) => b.length - a.length);
  return fragments.reduce((result, key) => result.replaceAll(key, messages[key][locale]), source);
}
