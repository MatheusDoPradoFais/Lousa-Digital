// app.js
// Ponto de entrada da aplicação: importa os módulos da lousa e
// inicializa os recursos (canvas, ferramentas, histórico, etc.).

import { setupCanvas, clearStrokes } from './canvas.js';
import { setTool, updateSizePreview } from './drawing.js';
import { syncAlignLabel, textBoxes, removeTextBox } from './text.js';
import { imageBoxes, removeImageBox } from './images.js';
import { pushHistory, updateHistoryButtons } from './history.js';

// Módulos que apenas registram seus próprios comportamentos (fundo e exportação)
import './background.js';
import './export.js';

// Limpar lousa (ação que combina traços, caixas de texto, imagens e histórico)
document.getElementById('clearBtn').addEventListener('click', function(){
  pushHistory();
  clearStrokes();
  textBoxes.slice().forEach(removeTextBox);
  imageBoxes.slice().forEach(removeImageBox);
});

// Init
setupCanvas(false);
setTool('pen');
syncAlignLabel();
updateSizePreview();
updateHistoryButtons();
pushHistory();
