// images.js
// Imagens coladas ou soltas na lousa: inserção, movimentação,
// redimensionamento, exclusão e eventos relacionados.

import { textLayer } from './canvas.js';
import { deselectBox } from './text.js';
import { startDragBox, bringImageToFront, createResizeHandles } from './box.js';
import { pushHistory } from './history.js';
import { addImage, updateImage, removeImage, getImage, hasImage, nextId, isRestoring, entriesEqual } from './core/state.js';

// As caixas de imagem (DOM) são a "vista" das imagens do estado central
// (core/state.js). Mudanças reais (inserir, mover, redimensionar, excluir)
// atualizam o estado e gravam uma entrada no histórico; restoreImageBox()
// recria a caixa a partir de uma entrada do estado (usado no undo/redo).
export let imageBoxes = [];
export let currentImageBox = null;

// ---------- Estado <-> DOM ----------
function serializeImageBox(box){
  const img = box.querySelector('.image-box-content');
  return {
    id: box.dataset.id,
    src: img.getAttribute('src'),
    left: parseFloat(box.style.left) || 0,     // % da camada
    top: parseFloat(box.style.top) || 0,       // % da camada
    width: parseFloat(box.style.width) || 0,   // px
    height: parseFloat(box.style.height) || 0, // px
    zIndex: parseInt(box.style.zIndex, 10) || 0
  };
}

// Grava a situação atual da caixa no estado central e no histórico
// (só se algo realmente mudou).
export function commitImageBox(box){
  if(isRestoring() || box._removed) return;
  const entry = serializeImageBox(box);
  const existing = getImage(entry.id);
  if(!existing){
    addImage(entry);
    pushHistory();
  } else if(!entriesEqual(existing, entry, ['zIndex'])){
    updateImage(entry.id, entry);
    pushHistory();
  }
}

// Empilhamento (z-index) muda ao selecionar a caixa, mas selecionar não é uma
// ação desfazível: apenas mantém o estado em dia, sem gravar histórico.
function syncImageZIndex(box){
  const id = box.dataset.id;
  const existing = getImage(id);
  const z = parseInt(box.style.zIndex, 10) || 0;
  if(existing && existing.zIndex !== z) updateImage(id, { zIndex: z });
}

// Monta a caixa (DOM + eventos), sem posicionar nem selecionar.
function buildImageBox(id, src){
  const box = document.createElement('div');
  box.className = 'image-box';
  box.dataset.id = id;

  const bar = document.createElement('div');
  bar.className = 'image-box-bar';
  bar.innerHTML = '<span class="grip">::::</span><button class="del" title="Excluir">✕</button>';

  const img = document.createElement('img');
  img.className = 'image-box-content';
  img.draggable = false;
  img.alt = 'Imagem colada na lousa';
  img.src = src;

  const handles = createResizeHandles(box);

  box.appendChild(bar);
  box.appendChild(img);
  Object.keys(handles).forEach(dir => box.appendChild(handles[dir]));
  textLayer.appendChild(box);
  imageBoxes.push(box);

  box.addEventListener('mousedown', function(e){
    if(e.target.closest('.del')) return;
    e.stopPropagation();
    selectImageBox(box);
    if(!e.target.closest('.resize-handle')){
      startDragBox(box, e);
    }
  });
  box.addEventListener('touchstart', function(e){
    if(e.target.closest('.del')) return;
    e.stopPropagation();
    selectImageBox(box);
    if(!e.target.closest('.resize-handle')){
      startDragBox(box, e);
    }
  }, {passive:false});

  bar.addEventListener('mousedown', function(e){ startDragBox(box, e); });
  bar.addEventListener('touchstart', function(e){ startDragBox(box, e); }, {passive:false});

  bar.querySelector('.del').addEventListener('click', function(e){
    e.stopPropagation();
    removeImageBox(box);
  });

  return box;
}

export function createImageBox(origin, src, naturalW, naturalH){
  const rect = textLayer.getBoundingClientRect();

  // Redimensiona a imagem para caber confortavelmente na lousa, mantendo a proporção
  const maxW = Math.max(80, rect.width * 0.6);
  const maxH = Math.max(80, rect.height * 0.6);
  let w = naturalW || 200, h = naturalH || 200;
  if(w > maxW){ h = h * (maxW / w); w = maxW; }
  if(h > maxH){ w = w * (maxH / h); h = maxH; }
  w = Math.max(60, w);
  h = Math.max(60, h);

  let x = origin ? origin.x - w / 2 : (rect.width - w) / 2;
  let y = origin ? origin.y - h / 2 : (rect.height - h) / 2;
  x = Math.max(0, Math.min(x, Math.max(0, rect.width - w)));
  y = Math.max(0, Math.min(y, Math.max(0, rect.height - h)));

  const box = buildImageBox(nextId('ib'), src);
  box.style.left = (x / rect.width * 100) + '%';
  box.style.top = (y / rect.height * 100) + '%';
  box.style.width = w + 'px';
  box.style.height = h + 'px';

  selectImageBox(box);
  commitImageBox(box); // entra no estado e no histórico (desfazível)
  return box;
}

// Recria uma caixa de imagem a partir de uma entrada do estado (restauração).
// Não seleciona nem grava histórico.
export function restoreImageBox(entry){
  const box = buildImageBox(entry.id, entry.src);
  box.style.left = entry.left + '%';
  box.style.top = entry.top + '%';
  box.style.width = entry.width + 'px';
  box.style.height = entry.height + 'px';
  if(entry.zIndex) box.style.zIndex = entry.zIndex;
  return box;
}

// Remove só o elemento do DOM (sem mexer no estado nem no histórico).
function destroyImageBox(box){
  box._removed = true;
  if(currentImageBox === box) deselectImageBox();
  imageBoxes = imageBoxes.filter(b => b !== box);
  box.remove();
}

// Remove todas as caixas de imagem do DOM (usado pela restauração completa).
export function clearImageBoxesDom(){
  imageBoxes.slice().forEach(destroyImageBox);
}

// Exclusão feita pelo usuário: remove do DOM, do estado e grava no histórico.
export function removeImageBox(box){
  const id = box.dataset.id;
  destroyImageBox(box);
  if(hasImage(id)){
    removeImage(id);
    pushHistory();
  }
}

export function selectImageBox(box){
  deselectBox();
  bringImageToFront(box);
  syncImageZIndex(box);
  if(currentImageBox && currentImageBox !== box) currentImageBox.classList.remove('selected');
  currentImageBox = box;
  box.classList.add('selected');
}

export function deselectImageBox(){
  if(currentImageBox) currentImageBox.classList.remove('selected');
  currentImageBox = null;
}

// Cola (Ctrl+V) uma imagem da área de transferência como uma caixa independente e
// arrastável na lousa — inclusive quando o cursor está dentro de uma caixa de texto,
// evitando que ela seja apagada por ficar "vazia" ao perder o foco.
document.addEventListener('paste', function(e){
  const items = (e.clipboardData && e.clipboardData.items) || [];
  let imageFile = null;
  for(let i = 0; i < items.length; i++){
    if(items[i].type && items[i].type.indexOf('image') === 0){
      imageFile = items[i].getAsFile();
      break;
    }
  }
  if(!imageFile) return; // não é imagem: deixa o comportamento padrão (colar texto, etc.)

  e.preventDefault();
  e.stopPropagation();

  const targetTextBox = e.target.closest ? e.target.closest('.text-box') : null;

  const reader = new FileReader();
  reader.onload = function(ev){
    const img = new Image();
    img.onload = function(){
      let origin = null;
      if(targetTextBox){
        const layerRect = textLayer.getBoundingClientRect();
        const boxRect = targetTextBox.getBoundingClientRect();
        origin = {
          x: (boxRect.left - layerRect.left) + boxRect.width / 2,
          y: (boxRect.top - layerRect.top) + boxRect.height / 2
        };
      }
      createImageBox(origin, ev.target.result, img.width, img.height);
    };
    img.onerror = function(){ alert('Não foi possível colar essa imagem.'); };
    img.src = ev.target.result;
  };
  reader.onerror = function(){ alert('Não foi possível ler a imagem colada.'); };
  reader.readAsDataURL(imageFile);
});

document.addEventListener('keydown', function(e){
  if((e.key === 'Delete' || e.key === 'Backspace') && currentImageBox){
    const active = document.activeElement;
    const isEditingText = active && (active.isContentEditable || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
    if(!isEditingText){
      e.preventDefault();
      removeImageBox(currentImageBox);
    }
  }
});
