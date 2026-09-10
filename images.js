// images.js
// Imagens coladas ou soltas na lousa: inserção, movimentação,
// redimensionamento, exclusão e eventos relacionados.

import { textLayer } from './canvas.js';
import { startResizeBox, startDragBox, bringToFront, deselectBox } from './text.js';

export let imageBoxes = [];
export let currentImageBox = null;
let imgBoxCounter = 0;

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

  const box = document.createElement('div');
  box.className = 'image-box';
  box.style.left = (x / rect.width * 100) + '%';
  box.style.top = (y / rect.height * 100) + '%';
  box.style.width = w + 'px';
  box.style.height = h + 'px';
  box.dataset.id = 'ib' + (++imgBoxCounter);

  const bar = document.createElement('div');
  bar.className = 'image-box-bar';
  bar.innerHTML = '<span class="grip">::::</span><button class="del" title="Excluir">✕</button>';

  const img = document.createElement('img');
  img.className = 'image-box-content';
  img.draggable = false;
  img.alt = 'Imagem colada na lousa';
  img.src = src;

  const handles = {};
  ['n','s','e','w','ne','nw','se','sw'].forEach(function(dir){
    const h2 = document.createElement('div');
    h2.className = 'resize-handle rh-' + dir;
    h2.title = 'Arraste para redimensionar';
    h2.addEventListener('mousedown', function(e){ startResizeBox(box, e, dir); });
    h2.addEventListener('touchstart', function(e){ startResizeBox(box, e, dir); }, {passive:false});
    handles[dir] = h2;
  });

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

  selectImageBox(box);
  return box;
}

export function removeImageBox(box){
  if(currentImageBox === box) deselectImageBox();
  imageBoxes = imageBoxes.filter(b => b !== box);
  box.remove();
}

export function selectImageBox(box){
  deselectBox();
  bringToFront(box);
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
