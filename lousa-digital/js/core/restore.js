// core/restore.js
// Restauração completa da lousa a partir de um estado (core/state.js).
//
// restoreState(state) é o ÚNICO caminho para "aplicar" um estado inteiro na
// tela: é usado pelo Undo/Redo (via history.js) e serve para futuras
// funcionalidades (abrir projeto, etc.). Ele reconstrói o DOM/canvas a partir
// dos dados — nada do que estava na tela é reaproveitado.
//
// Este módulo depende de vários outros (canvas, text, images, background), por
// isso NÃO é importado por eles: app.js o liga ao histórico com
// registerRestoreHandler(restoreState), evitando dependência circular.

import { setState, getState, beginRestore, endRestore } from './state.js';
import { clearStrokes, renderDrawings } from '../canvas.js';
import { clearTextBoxesDom, restoreTextBox, deselectBox, applyBoardTitle } from '../text.js';
import { clearImageBoxesDom, restoreImageBox, deselectImageBox } from '../images.js';
import { applyBackground } from '../background.js';
import { ensureZIndexAtLeast } from '../box.js';
import { cancelCurrentStroke, updateSizePreview } from '../drawing.js';
import { updateHistoryButtons } from '../history.js';

// Repinta a tela inteira a partir do estado VIVO (getState()).
export function renderBoard(){
  const state = getState();

  // 1. limpar o canvas (e qualquer gesto de desenho em andamento)
  cancelCurrentStroke();
  clearStrokes();

  // 2. remover os elementos atuais (caixas de texto e imagens) e a seleção
  clearTextBoxesDom();
  clearImageBoxesDom();
  deselectBox();
  deselectImageBox();

  // 3. restaurar desenhos
  renderDrawings();

  // 4. restaurar textos
  state.texts.forEach(restoreTextBox);

  // 5. restaurar imagens
  state.images.forEach(restoreImageBox);

  // 6. restaurar background (também sincroniza botões, painel de ajuste e sliders)
  //    e o título da lousa (texto, fonte e alinhamento)
  applyBackground(state.background);
  applyBoardTitle(state.title, state.titleStyle);

  // Projetos vindos de arquivo podem ter empilhamentos (z-index) maiores que os
  // contadores desta sessão: alinha os contadores para que novas seleções
  // continuem indo para a frente.
  ensureZIndexAtLeast(
    Math.max(0, ...state.texts.map(t => t.zIndex || 0)),
    Math.max(0, ...state.images.map(i => i.zIndex || 0))
  );

  // 7. atualizar a interface
  updateSizePreview();
  updateHistoryButtons();
}

// Substitui o estado da lousa por uma cópia de `state` e reconstrói tudo.
// Não grava histórico (quem chama decide se isso é uma nova ação ou não).
export function restoreState(state){
  beginRestore();
  try{
    setState(state); // guarda uma cópia profunda: nunca compartilha referência com `state`
    renderBoard();
  } finally {
    endRestore();
  }
}
