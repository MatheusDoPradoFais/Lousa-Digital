// box.js
// Comportamentos genéricos compartilhados por caixas de texto e caixas de
// imagem na lousa: criação das alças de redimensionar, arrastar, redimensionar
// e trazer para frente (z-index).
//
// Texto e imagem têm sua própria lógica de seleção (selectBox/selectImageBox,
// em text.js/images.js) e faixas de z-index diferentes, mas compartilham o
// mesmo comportamento de arrastar/redimensionar. Para evitar um import
// circular entre text.js e images.js, os dois módulos registram aqui (mesmo
// padrão de registro usado em canvas.js) o que este módulo precisa chamar,
// em vez de box.js importar diretamente de qualquer um dos dois.

import { textLayer } from './canvas.js';

let _selectBox = function(){};
let _selectImageBox = function(){};
export function registerBoxSelectors(selectBoxFn, selectImageBoxFn){
  _selectBox = selectBoxFn;
  _selectImageBox = selectImageBoxFn;
}

function selectForBox(box){
  if(box.classList.contains('image-box')){
    _selectImageBox(box);
  } else {
    _selectBox(box);
  }
}

// Chamado a cada passo de um arraste/redimensionamento, para que o menu de
// formatação de texto (que só existe em text.js) acompanhe a caixa em
// movimento. Registrado por text.js para não precisar de um import daqui
// para lá.
let _onBoxMove = function(){};
export function registerBoxMoveHook(fn){ _onBoxMove = fn; }

// Chamado quando um arraste/redimensionamento TERMINA e a geometria da caixa
// realmente mudou, para que o novo posicionamento entre no estado central e
// no histórico (desfazer/refazer). Registrado por text.js (que conhece
// commitTextBox e commitImageBox), pelo mesmo motivo dos hooks acima.
let _commitBox = function(){};
export function registerBoxCommitHook(fn){ _commitBox = fn; }

function boxGeometry(box){
  return box.style.left + '|' + box.style.top + '|' + box.style.width + '|' + box.style.height;
}

// Caixas de texto e imagens dividem a mesma camada (textLayer), então usamos
// duas faixas de z-index separadas: as imagens ficam sempre em uma faixa mais
// baixa (1..900) e os textos sempre em uma faixa mais alta (a partir de
// 10000). Assim, clicar/arrastar uma imagem nunca faz ela cobrir um texto por
// cima, mesmo quando estão sobrepostos na lousa.
let topZIndex = 10000;
let topImageZIndex = 0;

export function bringToFront(box){
  topZIndex += 1;
  box.style.zIndex = topZIndex;
}

// Garante que os contadores de empilhamento estejam à frente de valores
// restaurados de um projeto salvo em outra sessão (senão uma caixa selecionada
// depois ficaria ATRÁS de caixas antigas com z-index maior).
export function ensureZIndexAtLeast(textZ, imageZ){
  topZIndex = Math.max(topZIndex, textZ || 0);
  topImageZIndex = Math.max(topImageZIndex, imageZ || 0);
}

export function bringImageToFront(box){
  topImageZIndex = (topImageZIndex % 900) + 1;
  box.style.zIndex = topImageZIndex;
}

// Cria as 8 alças de redimensionar (cantos e lados) e já liga cada uma ao
// startResizeBox deste módulo. Usado por text.js e images.js, que só
// precisam anexar os elementos retornados à caixa.
export function createResizeHandles(box){
  const handles = {};
  ['n','s','e','w','ne','nw','se','sw'].forEach(function(dir){
    const h = document.createElement('div');
    h.className = 'resize-handle rh-' + dir;
    h.title = 'Arraste para redimensionar';
    h.addEventListener('mousedown', function(e){ startResizeBox(box, e, dir); });
    h.addEventListener('touchstart', function(e){ startResizeBox(box, e, dir); }, {passive:false});
    handles[dir] = h;
  });
  return handles;
}

export function startResizeBox(box, e, dir){
  e.preventDefault();
  e.stopPropagation();
  selectForBox(box);
  const MIN = 40;
  const layerRect = textLayer.getBoundingClientRect();
  const boxRect = box.getBoundingClientRect();
  const start = e.touches ? e.touches[0] : e;
  const startX = start.clientX;
  const startY = start.clientY;
  const startLeft = boxRect.left - layerRect.left;
  const startTop = boxRect.top - layerRect.top;
  const startWidth = boxRect.width;
  const startHeight = boxRect.height;
  const geometryBefore = boxGeometry(box);

  function onMove(ev){
    ev.preventDefault();
    const t = ev.touches ? ev.touches[0] : ev;
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;

    let left = startLeft, top = startTop, width = startWidth, height = startHeight;

    if(dir.includes('e')){
      width = Math.max(MIN, Math.min(startWidth + dx, layerRect.width - startLeft));
    }
    if(dir.includes('s')){
      height = Math.max(MIN, Math.min(startHeight + dy, layerRect.height - startTop));
    }
    if(dir.includes('w')){
      width = Math.max(MIN, startWidth - dx);
      left = Math.min(startLeft + startWidth - MIN, Math.max(0, startLeft + dx));
      width = startLeft + startWidth - left;
    }
    if(dir.includes('n')){
      height = Math.max(MIN, startHeight - dy);
      top = Math.min(startTop + startHeight - MIN, Math.max(0, startTop + dy));
      height = startTop + startHeight - top;
    }

    box.style.width = width + 'px';
    box.style.height = height + 'px';
    box.style.left = (left / layerRect.width * 100) + '%';
    box.style.top = (top / layerRect.height * 100) + '%';
    _onBoxMove(box);
  }
  function onUp(){
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onUp);
    if(boxGeometry(box) !== geometryBefore) _commitBox(box);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  document.addEventListener('touchmove', onMove, {passive:false});
  document.addEventListener('touchend', onUp);
}

export function startDragBox(box, e){
  e.preventDefault();
  e.stopPropagation();
  selectForBox(box);
  const rect = textLayer.getBoundingClientRect();
  const boxRect = box.getBoundingClientRect();
  const start = e.touches ? e.touches[0] : e;
  const offsetX = start.clientX - boxRect.left;
  const offsetY = start.clientY - boxRect.top;
  const geometryBefore = boxGeometry(box);

  function onMove(ev){
    const t = ev.touches ? ev.touches[0] : ev;
    let x = t.clientX - rect.left - offsetX;
    let y = t.clientY - rect.top - offsetY;
    x = Math.max(0, Math.min(x, rect.width - boxRect.width));
    y = Math.max(0, Math.min(y, rect.height - boxRect.height));
    box.style.left = (x / rect.width * 100) + '%';
    box.style.top = (y / rect.height * 100) + '%';
    _onBoxMove(box);
  }
  function onUp(){
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onUp);
    if(boxGeometry(box) !== geometryBefore) _commitBox(box);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  document.addEventListener('touchmove', onMove, {passive:false});
  document.addEventListener('touchend', onUp);
}
