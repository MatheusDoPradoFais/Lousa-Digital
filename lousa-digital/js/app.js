// app.js
// Ponto de entrada da aplicação: importa os módulos da lousa e
// inicializa os recursos (canvas, ferramentas, histórico, etc.).

import { setupCanvas } from './canvas.js';
import { setTool, updateSizePreview } from './drawing.js';
import { syncAlignLabel, commitPendingTextEdit } from './text.js';
import './images.js';
import { registerRestoreHandler, registerBeforeUndoHook, pushHistory, resetHistory } from './history.js';
import { clearState, isBoardEmpty } from './core/state.js';
import { restoreState, renderBoard } from './core/restore.js';

// Módulos que apenas registram seus próprios comportamentos (fundo e exportação)
import './background.js';
import './export.js';

// Liga o histórico à restauração completa da lousa (ver core/restore.js) e faz
// com que um texto ainda em digitação seja "fechado" antes de desfazer/refazer.
registerRestoreHandler(restoreState);
registerBeforeUndoHook(commitPendingTextEdit);

// Limpar lousa: remove desenhos, textos e imagens (o fundo é mantido) como UMA
// ação do histórico — Ctrl+Z restaura tudo de uma vez.
document.getElementById('clearBtn').addEventListener('click', function(){
  commitPendingTextEdit(); // um texto ainda em digitação entra no estado antes de limpar
  if(isBoardEmpty()) return; // nada para limpar: não cria entrada de histórico
  clearState({ keepBackground: true });
  renderBoard();
  pushHistory();
});

// Init
setupCanvas();
setTool('pen');
syncAlignLabel();
updateSizePreview();
resetHistory(); // a lousa inicial é a primeira entrada do histórico
