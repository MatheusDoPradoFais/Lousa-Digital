// text.js
// Caixas de texto da lousa: criação, edição, formatação, movimentação,
// redimensionamento e exclusão. Também cuida do título (label) da lousa,
// que é outro elemento de texto editável.

import { textLayer, wrap, textToolbar, registerTextBoxHooks } from './canvas.js';
import { color, isValidHex, normalizeHex } from './drawing.js';
import { selectImageBox, deselectImageBox } from './images.js';

// ---------- Text boxes (caixas de texto na lousa) ----------
export let textBoxes = [];
export let currentBox = null;
let boxCounter = 0;
let topZIndex = 10;

export function bringToFront(box){
  topZIndex += 1;
  box.style.zIndex = topZIndex;
}

export function createTextBox(p, sizeOpt){
  const rect = textLayer.getBoundingClientRect();
  const leftPct = Math.max(0, Math.min(96, (p.x / rect.width) * 100));
  const topPct = Math.max(0, Math.min(96, (p.y / rect.height) * 100));

  const box = document.createElement('div');
  box.className = 'text-box';
  box.style.left = leftPct + '%';
  box.style.top = topPct + '%';
  box.dataset.id = 'tb' + (++boxCounter);
  if(sizeOpt && sizeOpt.width){
    box.style.width = Math.max(60, Math.min(sizeOpt.width, rect.width - p.x)) + 'px';
  }

  const bar = document.createElement('div');
  bar.className = 'text-box-bar';
  bar.innerHTML = '<span class="grip">::::</span><button class="del" title="Excluir">✕</button>';

  const content = document.createElement('div');
  content.className = 'text-box-content';
  content.contentEditable = 'true';
  content.style.fontFamily = "'Caveat', cursive";
  content.style.fontSize = '28px';
  content.style.color = color;
  content.style.fontWeight = 'normal';
  content.style.fontStyle = 'normal';
  content.style.textDecorationLine = 'none';
  content.style.textAlign = 'left';
  content.style.backgroundColor = 'transparent';

  const handles = {};
  ['n','s','e','w','ne','nw','se','sw'].forEach(function(dir){
    const h = document.createElement('div');
    h.className = 'resize-handle rh-' + dir;
    h.title = 'Arraste para redimensionar';
    h.addEventListener('mousedown', function(e){ startResizeBox(box, e, dir); });
    h.addEventListener('touchstart', function(e){ startResizeBox(box, e, dir); }, {passive:false});
    handles[dir] = h;
  });

  box.appendChild(bar);
  box.appendChild(content);
  Object.keys(handles).forEach(dir => box.appendChild(handles[dir]));
  textLayer.appendChild(box);
  textBoxes.push(box);

  box.addEventListener('mousedown', function(e){ e.stopPropagation(); selectBox(box); });
  box.addEventListener('touchstart', function(e){ e.stopPropagation(); selectBox(box); }, {passive:true});

  bar.addEventListener('mousedown', function(e){ startDragBox(box, e); });
  bar.addEventListener('touchstart', function(e){ startDragBox(box, e); }, {passive:false});

  bar.querySelector('.del').addEventListener('click', function(e){
    e.stopPropagation();
    removeTextBox(box);
  });

  content.addEventListener('blur', function(){
    if(content.innerText.trim() === ''){
      removeTextBox(box);
    }
  });

  // Move o menu de formatação conforme a caixa cresce/encolhe (ex.: enquanto o usuário escreve)
  content.addEventListener('input', function(){
    if(currentBox === box) updateToolbarPosition(box);
  });
  if(typeof ResizeObserver !== 'undefined'){
    const ro = new ResizeObserver(function(){
      if(currentBox === box) updateToolbarPosition(box);
    });
    ro.observe(box);
    box._resizeObserver = ro;
  }

  selectBox(box);
  content.focus();
}

export function startResizeBox(box, e, dir){
  e.preventDefault();
  e.stopPropagation();
  if(box.classList.contains('image-box')){
    selectImageBox(box);
  } else {
    selectBox(box);
  }
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
    updateToolbarPosition(box);
  }
  function onUp(){
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onUp);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  document.addEventListener('touchmove', onMove, {passive:false});
  document.addEventListener('touchend', onUp);
}

export function removeTextBox(box){
  if(currentBox === box) deselectBox();
  if(box._resizeObserver){ box._resizeObserver.disconnect(); }
  textBoxes = textBoxes.filter(b => b !== box);
  box.remove();
}

export function selectBox(box){
  deselectImageBox();
  bringToFront(box);
  if(currentBox && currentBox !== box) currentBox.classList.remove('selected');
  currentBox = box;
  box.classList.add('selected');
  syncToolbarFromBox(box);
  updateToolbarPosition(box);
  textToolbar.classList.add('visible');
}

export function deselectBox(){
  if(currentBox) currentBox.classList.remove('selected');
  currentBox = null;
  textToolbar.classList.remove('visible');
}

export function updateToolbarPosition(box){
  const wrapRect = wrap.getBoundingClientRect();
  const boxRect = box.getBoundingClientRect();
  const tbWidth = textToolbar.offsetWidth || 260;
  const tbHeight = textToolbar.offsetHeight || 36;

  // Preferência 1: colocar o menu à direita da caixa, para não cobrir o que está sendo escrito.
  let left = (boxRect.right - wrapRect.left) + 10;
  let top = (boxRect.top - wrapRect.top);

  // Preferência 2: se não couber à direita, tenta à esquerda da caixa.
  if(left + tbWidth > wrapRect.width - 4){
    const leftSide = (boxRect.left - wrapRect.left) - tbWidth - 10;
    if(leftSide >= 4){
      left = leftSide;
    } else {
      // Preferência 3: sem espaço nas laterais, cai para acima/abaixo da caixa (sem sobrepor o texto).
      left = Math.max(4, Math.min((boxRect.left - wrapRect.left), wrapRect.width - tbWidth - 4));
      top = (boxRect.top - wrapRect.top) - tbHeight - 6;
      if(top < 4) top = (boxRect.bottom - wrapRect.top) + 6;
    }
  }

  top = Math.max(4, Math.min(top, wrapRect.height - tbHeight - 4));
  textToolbar.style.top = top + 'px';
  textToolbar.style.left = left + 'px';
}

// Registra em canvas.js como obter a caixa de texto selecionada e como
// reposicionar seu menu de formatação, para que syncOverlayLayers() (em
// canvas.js) consiga chamar updateToolbarPosition() sem que canvas.js
// precise importar text.js (o que criaria uma dependência circular).
registerTextBoxHooks(() => currentBox, updateToolbarPosition);

export function startDragBox(box, e){
  e.preventDefault();
  e.stopPropagation();
  if(box.classList.contains('image-box')){
    selectImageBox(box);
  } else {
    selectBox(box);
  }
  const rect = textLayer.getBoundingClientRect();
  const boxRect = box.getBoundingClientRect();
  const start = e.touches ? e.touches[0] : e;
  const offsetX = start.clientX - boxRect.left;
  const offsetY = start.clientY - boxRect.top;

  function onMove(ev){
    const t = ev.touches ? ev.touches[0] : ev;
    let x = t.clientX - rect.left - offsetX;
    let y = t.clientY - rect.top - offsetY;
    x = Math.max(0, Math.min(x, rect.width - boxRect.width));
    y = Math.max(0, Math.min(y, rect.height - boxRect.height));
    box.style.left = (x / rect.width * 100) + '%';
    box.style.top = (y / rect.height * 100) + '%';
    updateToolbarPosition(box);
  }
  function onUp(){
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onUp);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  document.addEventListener('touchmove', onMove, {passive:false});
  document.addEventListener('touchend', onUp);
}

// Text toolbar controls
const ttFont = document.getElementById('ttFont');
const ttSize = document.getElementById('ttSize');
const ttBold = document.getElementById('ttBold');
const ttItalic = document.getElementById('ttItalic');
const ttUnderline = document.getElementById('ttUnderline');
const ttStrike = document.getElementById('ttStrike');
const ttAlign = document.getElementById('ttAlign');
const ttDelete = document.getElementById('ttDelete');

export function syncAlignLabel(){
  ttAlign.textContent = ALIGN_ICONS.left;
}

const ALIGN_STATES = ['left', 'center', 'right'];
const ALIGN_ICONS = { left: '⟸', center: '≡', right: '⟹' };

function syncToolbarFromBox(box){
  const content = box.querySelector('.text-box-content');
  ttFont.value = content.style.fontFamily || "'Caveat', cursive";
  ttSize.value = parseInt(content.style.fontSize, 10) || 28;
  ttBold.classList.toggle('on', content.style.fontWeight === 'bold');
  ttItalic.classList.toggle('on', content.style.fontStyle === 'italic');

  const decoration = content.style.textDecorationLine || content.style.textDecoration || '';
  ttUnderline.classList.toggle('on', decoration.includes('underline'));
  ttStrike.classList.toggle('on', decoration.includes('line-through'));

  const align = content.style.textAlign || 'left';
  ttAlign.textContent = ALIGN_ICONS[align] || ALIGN_ICONS.left;

  textToolbar.querySelectorAll('.tt-color').forEach(c => {
    c.classList.toggle('on', c.dataset.color.toLowerCase() === (content.style.color || '').toLowerCase()
      || rgbToHex(content.style.color) === c.dataset.color.toLowerCase());
  });
  const currentColor = content.style.color || '#f6f3e6';
  ttColorHex.value = currentColor;
  if(isValidHex(currentColor)) ttColorPicker.value = normalizeHex(currentColor);

  const bg = content.style.backgroundColor || '';
  textToolbar.querySelectorAll('.tt-bg').forEach(c => {
    const isNone = c.dataset.bg === '';
    c.classList.toggle('on', isNone ? (bg === '' || bg === 'transparent') : bg === c.dataset.bg);
  });
}

function toggleDecoration(content, value){
  const current = (content.style.textDecorationLine || content.style.textDecoration || '')
    .split(' ').filter(Boolean).filter(v => v !== 'none');
  const has = current.includes(value);
  const next = has ? current.filter(v => v !== value) : current.concat(value);
  content.style.textDecorationLine = next.length ? next.join(' ') : 'none';
}

function rgbToHex(rgb){
  const m = (rgb || '').match(/\d+/g);
  if(!m) return '';
  return '#' + m.slice(0,3).map(n => parseInt(n,10).toString(16).padStart(2,'0')).join('');
}

ttFont.addEventListener('change', function(){
  if(!currentBox) return;
  currentBox.querySelector('.text-box-content').style.fontFamily = ttFont.value;
});
ttSize.addEventListener('input', function(){
  if(!currentBox) return;
  currentBox.querySelector('.text-box-content').style.fontSize = ttSize.value + 'px';
  updateToolbarPosition(currentBox);
});
ttBold.addEventListener('click', function(){
  if(!currentBox) return;
  const content = currentBox.querySelector('.text-box-content');
  const isBold = content.style.fontWeight === 'bold';
  content.style.fontWeight = isBold ? 'normal' : 'bold';
  ttBold.classList.toggle('on', !isBold);
});
ttItalic.addEventListener('click', function(){
  if(!currentBox) return;
  const content = currentBox.querySelector('.text-box-content');
  const isItalic = content.style.fontStyle === 'italic';
  content.style.fontStyle = isItalic ? 'normal' : 'italic';
  ttItalic.classList.toggle('on', !isItalic);
});
ttUnderline.addEventListener('click', function(){
  if(!currentBox) return;
  const content = currentBox.querySelector('.text-box-content');
  toggleDecoration(content, 'underline');
  syncToolbarFromBox(currentBox);
});
ttStrike.addEventListener('click', function(){
  if(!currentBox) return;
  const content = currentBox.querySelector('.text-box-content');
  toggleDecoration(content, 'line-through');
  syncToolbarFromBox(currentBox);
});
ttAlign.addEventListener('click', function(){
  if(!currentBox) return;
  const content = currentBox.querySelector('.text-box-content');
  const current = content.style.textAlign || 'left';
  const next = ALIGN_STATES[(ALIGN_STATES.indexOf(current) + 1) % ALIGN_STATES.length];
  content.style.textAlign = next;
  ttAlign.textContent = ALIGN_ICONS[next];
});
textToolbar.querySelectorAll('.tt-color').forEach(function(swatch){
  swatch.addEventListener('click', function(){
    if(!currentBox) return;
    currentBox.querySelector('.text-box-content').style.color = swatch.dataset.color;
    textToolbar.querySelectorAll('.tt-color').forEach(c => c.classList.remove('on'));
    swatch.classList.add('on');
    ttColorHex.value = swatch.dataset.color;
    ttColorPicker.value = normalizeHex(swatch.dataset.color);
  });
});

const ttColorPicker = document.getElementById('ttColorPicker');
const ttColorHex = document.getElementById('ttColorHex');

function applyTtColor(hex){
  if(!currentBox) return;
  currentBox.querySelector('.text-box-content').style.color = hex;
  textToolbar.querySelectorAll('.tt-color').forEach(c => c.classList.remove('on'));
  ttColorPicker.value = normalizeHex(hex);
  ttColorHex.value = hex;
}
ttColorPicker.addEventListener('input', function(){
  applyTtColor(ttColorPicker.value);
});
function commitTtHex(){
  if(!currentBox) return;
  let v = ttColorHex.value.trim();
  if(v && v[0] !== '#') v = '#' + v;
  if(isValidHex(v)){
    applyTtColor(normalizeHex(v));
  } else {
    const content = currentBox.querySelector('.text-box-content');
    ttColorHex.value = content.style.color || '#f6f3e6';
  }
}
ttColorHex.addEventListener('change', commitTtHex);
ttColorHex.addEventListener('keydown', function(e){
  if(e.key === 'Enter'){ e.preventDefault(); commitTtHex(); ttColorHex.blur(); }
});
textToolbar.querySelectorAll('.tt-bg').forEach(function(swatch){
  swatch.addEventListener('click', function(){
    if(!currentBox) return;
    const content = currentBox.querySelector('.text-box-content');
    const bg = swatch.dataset.bg;
    content.style.backgroundColor = bg || 'transparent';
    content.style.borderRadius = bg ? '4px' : '0';
    content.style.padding = bg ? '2px 5px' : '0';
    textToolbar.querySelectorAll('.tt-bg').forEach(c => c.classList.remove('on'));
    swatch.classList.add('on');
  });
});
ttDelete.addEventListener('click', function(){
  if(!currentBox) return;
  removeTextBox(currentBox);
});

document.addEventListener('mousedown', function(e){
  if(!e.target.closest('.image-box')) deselectImageBox();
  if(e.target.closest('.text-box') || e.target.closest('.text-toolbar') || e.target.closest('#textBtn')) return;
  deselectBox();
});

// ---------- Título da lousa (label) ----------
export const boardLabel = document.getElementById('boardLabel');
try{
  const savedName = localStorage.getItem('lousa-nome');
  if(savedName) boardLabel.textContent = savedName;
}catch(e){}

// Fonte e alinhamento do título
const labelFont = document.getElementById('labelFont');
const labelAlignBtn = document.getElementById('labelAlignBtn');
let titleAlign = 'left';

function applyTitleAlign(a){
  if(TITLE_ALIGN_STATES.indexOf(a) === -1) a = 'left';
  titleAlign = a;
  boardLabel.style.textAlign = a;
  labelAlignBtn.textContent = ALIGN_ICONS[a];
}
const TITLE_ALIGN_STATES = ['left', 'center', 'right'];

labelFont.addEventListener('change', function(){
  boardLabel.style.fontFamily = labelFont.value;
  try{ localStorage.setItem('lousa-fonte', labelFont.value); }catch(e){}
});
labelAlignBtn.addEventListener('click', function(){
  const next = TITLE_ALIGN_STATES[(TITLE_ALIGN_STATES.indexOf(titleAlign) + 1) % TITLE_ALIGN_STATES.length];
  applyTitleAlign(next);
  try{ localStorage.setItem('lousa-alinhamento', next); }catch(e){}
});

try{
  const savedFont = localStorage.getItem('lousa-fonte');
  if(savedFont){
    boardLabel.style.fontFamily = savedFont;
    labelFont.value = savedFont;
  }
  const savedAlign = localStorage.getItem('lousa-alinhamento');
  if(savedAlign) applyTitleAlign(savedAlign);
  else applyTitleAlign('left');
}catch(e){ applyTitleAlign('left'); }

boardLabel.addEventListener('focus', function(){
  const range = document.createRange();
  range.selectNodeContents(boardLabel);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
});
boardLabel.addEventListener('keydown', function(e){
  if(e.key === 'Enter'){ e.preventDefault(); boardLabel.blur(); }
  if(e.key === 'Escape'){ boardLabel.blur(); }
});
boardLabel.addEventListener('blur', function(){
  let name = boardLabel.textContent.replace(/\s+/g, ' ').trim();
  if(!name) name = 'lousa';
  boardLabel.textContent = name;
  try{ localStorage.setItem('lousa-nome', name); }catch(e){}
});
