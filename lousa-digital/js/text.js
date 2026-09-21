// text.js
// Caixas de texto da lousa: criação, edição, formatação, movimentação,
// redimensionamento e exclusão. Também cuida do título (label) da lousa,
// que é outro elemento de texto editável.

import { textLayer, wrap, textToolbar, registerTextBoxHooks } from './canvas.js';
import { color, isValidHex, normalizeHex } from './drawing.js';
import { selectImageBox, deselectImageBox, commitImageBox } from './images.js';
import { bringToFront, startDragBox, createResizeHandles, registerBoxSelectors, registerBoxMoveHook, registerBoxCommitHook } from './box.js';
import { pushHistory } from './history.js';
import { addText, updateText, removeText, getText, hasText, nextId, isRestoring, entriesEqual } from './core/state.js';

// ---------- Text boxes (caixas de texto na lousa) ----------
// As caixas (DOM) são a "vista" dos textos do estado central (core/state.js).
// Uma caixa só entra no estado/histórico quando é "confirmada" (ao perder o
// foco com conteúdo, ao mudar o formato, ao terminar de mover/redimensionar
// ou ao ser excluída) — nunca a cada tecla digitada.
export let textBoxes = [];
export let currentBox = null;

// Registra em box.js como selecionar cada tipo de caixa (texto vs. imagem) e
// como reposicionar o menu de formatação de texto durante um arraste/resize,
// para que box.js não precise importar text.js/images.js diretamente (o que
// criaria um import circular). Ver box.js para detalhes.
registerBoxSelectors(selectBox, selectImageBox);
registerBoxMoveHook(updateToolbarPosition);
// Ao terminar de arrastar/redimensionar uma caixa (texto ou imagem), grava a nova geometria.
registerBoxCommitHook(function(box){
  if(box.classList.contains('image-box')) commitImageBox(box);
  else commitTextBox(box);
});

// ---------- Estado <-> DOM ----------
function boxIsEmpty(box){
  return box.querySelector('.text-box-content').innerText.trim() === '';
}

function serializeTextBox(box){
  const content = box.querySelector('.text-box-content');
  const st = content.style;
  return {
    id: box.dataset.id,
    left: parseFloat(box.style.left) || 0,   // % da camada
    top: parseFloat(box.style.top) || 0,     // % da camada
    width: box.style.width ? parseFloat(box.style.width) : null,   // px (null = automática)
    height: box.style.height ? parseFloat(box.style.height) : null, // px (null = automática)
    zIndex: parseInt(box.style.zIndex, 10) || 0,
    // innerHTML preserva quebras de linha e formatação colada. Ao carregar projetos
    // de fontes externas (futuro), este HTML deve ser sanitizado antes de restaurar.
    html: content.innerHTML,
    style: {
      fontFamily: st.fontFamily,
      fontSize: st.fontSize,
      color: st.color,
      fontWeight: st.fontWeight,
      fontStyle: st.fontStyle,
      textDecorationLine: st.textDecorationLine,
      textAlign: st.textAlign,
      backgroundColor: st.backgroundColor,
      borderRadius: st.borderRadius,
      padding: st.padding
    }
  };
}

// Grava a situação atual da caixa no estado central e no histórico
// (só se algo realmente mudou). Não remove caixas vazias — ver finalizeTextBox().
export function commitTextBox(box){
  if(isRestoring() || box._removed) return;
  const entry = serializeTextBox(box);
  const existing = getText(entry.id);
  if(!existing){
    if(boxIsEmpty(box)) return; // caixa nova ainda vazia: nada a registrar
    addText(entry);
    pushHistory();
  } else if(!entriesEqual(existing, entry, ['zIndex'])){
    updateText(entry.id, entry);
    pushHistory();
  }
}

// Fim de edição (perda de foco / desfazer): caixa vazia é descartada como antes
// (e, se já existia no estado, isso vira uma exclusão no histórico);
// caixa com conteúdo é confirmada.
function finalizeTextBox(box){
  if(isRestoring() || box._removed) return;
  if(boxIsEmpty(box)) removeTextBox(box);
  else commitTextBox(box);
}

// Chamado pelo histórico antes de desfazer/refazer, para que um texto que
// ainda está sendo digitado entre no histórico e não se perca na restauração.
export function commitPendingTextEdit(){
  if(currentBox) finalizeTextBox(currentBox);
}

// Empilhamento (z-index) muda ao selecionar a caixa, mas selecionar não é uma
// ação desfazível: apenas mantém o estado em dia, sem gravar histórico.
function syncTextZIndex(box){
  const id = box.dataset.id;
  const existing = getText(id);
  const z = parseInt(box.style.zIndex, 10) || 0;
  if(existing && existing.zIndex !== z) updateText(id, { zIndex: z });
}

// Monta a caixa (DOM + eventos), sem estilo inicial, posição nem seleção.
function buildTextBox(id){
  const box = document.createElement('div');
  box.className = 'text-box';
  box.dataset.id = id;

  const bar = document.createElement('div');
  bar.className = 'text-box-bar';
  bar.innerHTML = '<span class="grip">::::</span><button class="del" title="Excluir">✕</button>';

  const content = document.createElement('div');
  content.className = 'text-box-content';
  content.contentEditable = 'true';

  const handles = createResizeHandles(box);

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
    // Caixa removida por código (exclusão/restauração): ignora o blur gerado pela remoção.
    if(box._removed || isRestoring()) return;
    finalizeTextBox(box);
  });

  // Move o menu de formatação conforme a caixa cresce/encolhe (ex.: enquanto o usuário escreve)
  content.addEventListener('input', function(){
    growBoxToFitContent(box);
    if(currentBox === box) updateToolbarPosition(box);
  });
  if(typeof ResizeObserver !== 'undefined'){
    const ro = new ResizeObserver(function(){
      if(currentBox === box) updateToolbarPosition(box);
    });
    ro.observe(box);
    box._resizeObserver = ro;
  }

  return box;
}

export function createTextBox(p, sizeOpt){
  const rect = textLayer.getBoundingClientRect();
  const leftPct = Math.max(0, Math.min(96, (p.x / rect.width) * 100));
  const topPct = Math.max(0, Math.min(96, (p.y / rect.height) * 100));

  const box = buildTextBox(nextId('tb'));
  box.style.left = leftPct + '%';
  box.style.top = topPct + '%';
  if(sizeOpt && sizeOpt.width){
    box.style.width = Math.max(60, Math.min(sizeOpt.width, rect.width - p.x)) + 'px';
  }

  const content = box.querySelector('.text-box-content');
  content.style.fontFamily = "'Caveat', cursive";
  content.style.fontSize = '28px';
  content.style.color = color;
  content.style.fontWeight = 'normal';
  content.style.fontStyle = 'normal';
  content.style.textDecorationLine = 'none';
  content.style.textAlign = 'left';
  content.style.backgroundColor = 'transparent';

  selectBox(box);
  content.focus();
}

// Recria uma caixa de texto a partir de uma entrada do estado (restauração).
// Não seleciona, não dá foco e não grava histórico.
export function restoreTextBox(entry){
  const box = buildTextBox(entry.id);
  box.style.left = entry.left + '%';
  box.style.top = entry.top + '%';
  if(entry.width !== null && entry.width !== undefined) box.style.width = entry.width + 'px';
  if(entry.height !== null && entry.height !== undefined) box.style.height = entry.height + 'px';
  if(entry.zIndex) box.style.zIndex = entry.zIndex;

  const content = box.querySelector('.text-box-content');
  const st = entry.style || {};
  Object.keys(st).forEach(function(prop){ content.style[prop] = st[prop]; });
  content.innerHTML = entry.html || '';
  return box;
}

// Remove só o elemento do DOM (sem mexer no estado nem no histórico).
function destroyTextBox(box){
  box._removed = true;
  if(currentBox === box) deselectBox();
  if(box._resizeObserver){ box._resizeObserver.disconnect(); }
  textBoxes = textBoxes.filter(b => b !== box);
  box.remove();
}

// Remove todas as caixas de texto do DOM (usado pela restauração completa).
export function clearTextBoxesDom(){
  textBoxes.slice().forEach(destroyTextBox);
}

// Exclusão feita pelo usuário (ou caixa vazia descartada): remove do DOM e, se a
// caixa já fazia parte do estado, também do estado — gravando no histórico.
export function removeTextBox(box){
  const id = box.dataset.id;
  destroyTextBox(box);
  if(hasText(id)){
    removeText(id);
    pushHistory();
  }
}

export function selectBox(box){
  deselectImageBox();
  bringToFront(box);
  syncTextZIndex(box);
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

// Se a caixa teve sua altura travada manualmente (arrastando as alças de
// redimensionar), aumentar a fonte (ou negrito/itálico/fonte) pode fazer o
// texto não caber mais — e como o conteúdo tem overflow-y:auto, ele ficava
// escondido com rolagem em vez de aparecer. Aqui, sempre que o conteúdo não
// couber mais na altura atual, a caixa cresce o suficiente para mostrá-lo.
// Caixas sem altura fixada (criadas por clique simples) não são afetadas,
// pois já crescem naturalmente com o conteúdo.
function growBoxToFitContent(box){
  if(!box.style.height) return;
  const content = box.querySelector('.text-box-content');
  if(content.scrollHeight <= content.clientHeight) return;
  // "chrome" = espaço consumido pelo próprio invólucro da caixa (padding/borda),
  // calculado a partir do que já está renderizado, para não depender de valores fixos.
  const chrome = box.getBoundingClientRect().height - content.clientHeight;
  box.style.height = (content.scrollHeight + chrome) + 'px';
  // Ao crescer, a barra de rolagem interna desaparece e a largura disponível para
  // o texto aumenta um pouco, o que pode reorganizar as linhas — resolve em uma
  // segunda passada para não sobrar nenhum pedaço de texto cortado.
  if(content.scrollHeight > content.clientHeight){
    box.style.height = (content.scrollHeight + chrome) + 'px';
  }
}

ttFont.addEventListener('change', function(){
  if(!currentBox) return;
  currentBox.querySelector('.text-box-content').style.fontFamily = ttFont.value;
  growBoxToFitContent(currentBox);
  updateToolbarPosition(currentBox);
  commitTextBox(currentBox);
});

// O slider de tamanho dispara um evento "input" a cada pixel arrastado. Como
// growBoxToFitContent/updateToolbarPosition precisam ler medidas de layout
// (o que força o navegador a recalcular tudo na hora), fazer isso a cada
// evento deixava o arraste travado/instável — principalmente com uma imagem
// por perto, que é mais cara de redesenhar. Aqui aplicamos o tamanho da fonte
// imediatamente (isso é barato), mas adiamos o recálculo de layout para no
// máximo uma vez por quadro de tela.
let pendingSizeUpdate = null;
ttSize.addEventListener('input', function(){
  if(!currentBox) return;
  currentBox.querySelector('.text-box-content').style.fontSize = ttSize.value + 'px';
  if(pendingSizeUpdate) return;
  const box = currentBox;
  pendingSizeUpdate = requestAnimationFrame(function(){
    pendingSizeUpdate = null;
    growBoxToFitContent(box);
    updateToolbarPosition(box);
  });
});
// "input" dispara a cada pixel do arraste; o tamanho só entra no histórico
// quando o usuário solta o controle ("change"), como uma única ação.
ttSize.addEventListener('change', function(){
  if(!currentBox) return;
  growBoxToFitContent(currentBox);
  commitTextBox(currentBox);
});
ttBold.addEventListener('click', function(){
  if(!currentBox) return;
  const content = currentBox.querySelector('.text-box-content');
  const isBold = content.style.fontWeight === 'bold';
  content.style.fontWeight = isBold ? 'normal' : 'bold';
  ttBold.classList.toggle('on', !isBold);
  growBoxToFitContent(currentBox);
  updateToolbarPosition(currentBox);
  commitTextBox(currentBox);
});
ttItalic.addEventListener('click', function(){
  if(!currentBox) return;
  const content = currentBox.querySelector('.text-box-content');
  const isItalic = content.style.fontStyle === 'italic';
  content.style.fontStyle = isItalic ? 'normal' : 'italic';
  ttItalic.classList.toggle('on', !isItalic);
  commitTextBox(currentBox);
});
ttUnderline.addEventListener('click', function(){
  if(!currentBox) return;
  const content = currentBox.querySelector('.text-box-content');
  toggleDecoration(content, 'underline');
  syncToolbarFromBox(currentBox);
  commitTextBox(currentBox);
});
ttStrike.addEventListener('click', function(){
  if(!currentBox) return;
  const content = currentBox.querySelector('.text-box-content');
  toggleDecoration(content, 'line-through');
  syncToolbarFromBox(currentBox);
  commitTextBox(currentBox);
});
ttAlign.addEventListener('click', function(){
  if(!currentBox) return;
  const content = currentBox.querySelector('.text-box-content');
  const current = content.style.textAlign || 'left';
  const next = ALIGN_STATES[(ALIGN_STATES.indexOf(current) + 1) % ALIGN_STATES.length];
  content.style.textAlign = next;
  ttAlign.textContent = ALIGN_ICONS[next];
  commitTextBox(currentBox);
});
textToolbar.querySelectorAll('.tt-color').forEach(function(swatch){
  swatch.addEventListener('click', function(){
    if(!currentBox) return;
    currentBox.querySelector('.text-box-content').style.color = swatch.dataset.color;
    textToolbar.querySelectorAll('.tt-color').forEach(c => c.classList.remove('on'));
    swatch.classList.add('on');
    ttColorHex.value = swatch.dataset.color;
    ttColorPicker.value = normalizeHex(swatch.dataset.color);
    commitTextBox(currentBox);
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
// O seletor de cor dispara "input" continuamente; a cor só entra no histórico ao confirmar ("change").
ttColorPicker.addEventListener('change', function(){
  if(currentBox) commitTextBox(currentBox);
});
function commitTtHex(){
  if(!currentBox) return;
  let v = ttColorHex.value.trim();
  if(v && v[0] !== '#') v = '#' + v;
  if(isValidHex(v)){
    applyTtColor(normalizeHex(v));
    commitTextBox(currentBox);
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
    commitTextBox(currentBox);
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
