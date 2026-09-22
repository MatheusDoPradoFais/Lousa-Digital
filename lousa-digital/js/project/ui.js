// project/ui.js
// Liga a interface aos projetos: botões Novo / Abrir / Salvar / Salvar como,
// o indicador "● Salvo" / "● Alterações não salvas", atalhos de teclado e o
// aviso do navegador ao fechar a página com alterações não salvas.

import { newProject, openProject, saveProject, saveProjectAs, onProjectChange, isDirty } from './project.js';
import { isDialogOpen } from './dialog.js';

const statusEl = document.getElementById('projectStatus');
const statusText = statusEl.querySelector('.txt');
const fileEl = document.getElementById('projectFile');

function render(info){
  statusEl.classList.toggle('dirty', info.dirty);
  statusText.textContent = info.dirty ? 'Alterações não salvas' : 'Salvo';
  fileEl.textContent = info.fileName || '';
  fileEl.title = info.fileName ? 'Arquivo do projeto: ' + info.fileName : '';
  fileEl.hidden = !info.fileName;
}
onProjectChange(render);

document.getElementById('projNewBtn').addEventListener('click', newProject);
document.getElementById('projOpenBtn').addEventListener('click', openProject);
document.getElementById('projSaveBtn').addEventListener('click', saveProject);
document.getElementById('projSaveAsBtn').addEventListener('click', saveProjectAs);

// Atalhos: Ctrl+S salvar, Ctrl+Shift+S salvar como, Ctrl+O abrir
// (Cmd no Mac). Substituem os atalhos padrão do navegador (salvar/abrir página).
document.addEventListener('keydown', function(e){
  if(!(e.ctrlKey || e.metaKey) || e.altKey) return;
  const key = e.key.toLowerCase();
  if(key !== 's' && key !== 'o') return;
  e.preventDefault();
  if(isDialogOpen()) return;
  if(key === 's') (e.shiftKey ? saveProjectAs : saveProject)();
  else if(!e.shiftKey) openProject();
});

// Fechar/recarregar a aba com alterações não salvas: o navegador pede confirmação.
window.addEventListener('beforeunload', function(e){
  if(!isDirty()) return;
  e.preventDefault();
  e.returnValue = '';
});
