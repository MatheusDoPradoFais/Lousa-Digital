// history.js
// Histórico da lousa inteira: undo, redo e atalhos de teclado relacionados.
//
// Cada entrada do histórico é um SNAPSHOT COMPLETO do estado central
// (core/state.js): background, desenhos, textos e imagens — cópia profunda,
// sem nenhuma referência compartilhada com o estado vivo.
//
// Modelo: `stack[index]` é sempre o estado ATUAL da lousa.
//  - pushHistory() grava o estado atual como nova entrada (e descarta o "refazer").
//  - undo()/redo() movem `index` e pedem a restauração completa daquela entrada.
//
// history.js não importa os módulos que desenham/renderizam (canvas, text,
// images, background) — eles importam history.js para chamar pushHistory().
// Para não criar dependência circular, quem sabe restaurar a lousa
// (core/restore.js) se registra aqui via registerRestoreHandler(), e quem
// precisa "fechar" edições pendentes antes de desfazer (text.js) se registra
// via registerBeforeUndoHook(). Mesmo padrão de registro usado em canvas.js.

import { getStateSnapshot, getRevision, isRestoring } from './core/state.js';

const MAX_HISTORY = 40;

let stack = [];
let index = -1;
let lastRevision = -1; // revisão do estado no momento do último push/restauração

let restoreHandler = function(){};
export function registerRestoreHandler(fn){ restoreHandler = fn; }

let beforeUndoHook = function(){};
export function registerBeforeUndoHook(fn){ beforeUndoHook = fn; }

const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');

export function updateHistoryButtons(){
  undoBtn.disabled = index <= 0;
  redoBtn.disabled = index >= stack.length - 1;
}

// Grava o estado atual da lousa como nova entrada do histórico.
// Deve ser chamado DEPOIS que a ação já alterou o estado (core/state.js).
// Não faz nada se o estado não mudou desde a última entrada.
export function pushHistory(){
  if(isRestoring()) return;
  if(getRevision() === lastRevision) return;
  // Uma nova ação depois de um undo invalida o "refazer".
  stack.length = index + 1;
  stack.push(getStateSnapshot());
  if(stack.length > MAX_HISTORY) stack.shift();
  index = stack.length - 1;
  lastRevision = getRevision();
  updateHistoryButtons();
}

// Define o estado atual como ponto de partida do histórico (limpa o resto).
export function resetHistory(){
  stack = [getStateSnapshot()];
  index = 0;
  lastRevision = getRevision();
  updateHistoryButtons();
}

function restoreEntry(i){
  // restoreState() (core/restore.js) passa a entrada por setState(), que guarda
  // uma CÓPIA profunda: o estado vivo nunca compartilha referências com os
  // snapshots do histórico (editar a lousa depois não corrompe undo/redo).
  restoreHandler(stack[i]);
  lastRevision = getRevision();
  updateHistoryButtons();
}

export function undo(){
  beforeUndoHook(); // fecha edição pendente (ex.: texto sendo digitado)
  if(index <= 0) return;
  index--;
  restoreEntry(index);
}

export function redo(){
  beforeUndoHook();
  if(index >= stack.length - 1) return;
  index++;
  restoreEntry(index);
}

// Undo / redo
undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);

document.addEventListener('keydown', function(e){
  if(!(e.ctrlKey || e.metaKey)) return;
  const key = e.key.toLowerCase();
  if(key === 'z' && !e.shiftKey){
    e.preventDefault();
    undo();
  } else if(key === 'y' || (key === 'z' && e.shiftKey)){
    e.preventDefault();
    redo();
  }
});
