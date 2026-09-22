// app.js
// Ponto de entrada da aplicação: importa os módulos da lousa e
// inicializa os recursos (canvas, ferramentas, histórico, etc.).

import { setupCanvas } from './canvas.js';
import { setTool, updateSizePreview } from './drawing.js';
import { syncAlignLabel, commitPendingTextEdit, readBoardTitle } from './text.js';
import './images.js';
import { registerRestoreHandler, registerBeforeUndoHook, pushHistory, resetHistory } from './history.js';
import { clearState, isBoardEmpty, setTitle, setTitleStyle } from './core/state.js';
import { restoreState, renderBoard } from './core/restore.js';

// Módulos que apenas registram seus próprios comportamentos (fundo e exportação)
import './background.js';
import './export.js';

// Projetos (Novo / Abrir / Salvar / Salvar como): interface e indicador de alterações
import './project/ui.js';
import { initProject } from './project/project.js';

// Liga o histórico à restauração completa da lousa (ver core/restore.js) e faz
// com que um texto ainda em digitação seja "fechado" antes de desfazer/refazer.
registerRestoreHandler(restoreState);
registerBeforeUndoHook(commitPendingTextEdit);

// Limpar lousa: remove desenhos, textos e imagens (o fundo e o título são mantidos) como UMA
// ação do histórico — Ctrl+Z restaura tudo de uma vez.
document.getElementById('clearBtn').addEventListener('click', function(){
  commitPendingTextEdit(); // um texto ainda em digitação entra no estado antes de limpar
  if(isBoardEmpty()) return; // nada para limpar: não cria entrada de histórico
  clearState({ keepBackground: true, keepTitle: true });
  renderBoard();
  pushHistory();
});

// Init
setupCanvas();
setTool('pen');
syncAlignLabel();
updateSizePreview();
// O título (que pode vir do localStorage, como antes) passa a fazer parte do estado
const initialTitle = readBoardTitle();
setTitle(initialTitle.title);
setTitleStyle(initialTitle.style);
resetHistory(); // a lousa inicial é a primeira entrada do histórico
initProject();  // e conta como "salva": nada foi alterado ainda
