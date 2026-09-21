// drawing.js
// Ferramenta caneta/giz e borracha, cores do giz, tamanho do pincel
// e eventos/lógica de desenhar e apagar na lousa.

import { canvas, textLayer, pos, drawSegment, getCanvasCssSize } from './canvas.js';
import { createTextBox } from './text.js';
import { pushHistory } from './history.js';
import { bgMode } from './background.js';
import { addDrawing, nextId } from './core/state.js';

export let color = '#f6f3e6';
let size = 6;
export let tool = 'pen'; // 'pen' | 'eraser' | 'text'
let drawing = false;
let last = null;
// Traço em andamento: só entra no estado central (e no histórico) quando o
// usuário solta o mouse/dedo. Pontos normalizados 0..1: [x0, y0, x1, y1, ...]
let currentStroke = null;

let textDragStart = null;
let textDragCurrent = null;
let textDragPreview = null;

function positionDragPreview(p1, p2){
  const x = Math.min(p1.x, p2.x);
  const y = Math.min(p1.y, p2.y);
  const w = Math.abs(p2.x - p1.x);
  const h = Math.abs(p2.y - p1.y);
  textDragPreview.style.left = x + 'px';
  textDragPreview.style.top = y + 'px';
  textDragPreview.style.width = w + 'px';
  textDragPreview.style.height = h + 'px';
}

function startDraw(e){
  if(tool === 'text'){
    e.preventDefault();
    textDragStart = pos(e);
    textDragCurrent = textDragStart;
    textDragPreview = document.createElement('div');
    textDragPreview.className = 'text-drag-preview';
    textLayer.appendChild(textDragPreview);
    positionDragPreview(textDragStart, textDragStart);
    return;
  }
  e.preventDefault();
  drawing = true;
  last = pos(e);
  const size0 = getCanvasCssSize();
  currentStroke = {
    id: nextId('d'),
    tool: tool === 'eraser' ? 'eraser' : 'pen',
    color: color,
    size: size,
    points: [last.x / size0.w, last.y / size0.h]
  };
}

function moveDraw(e){
  if(tool === 'text' && textDragStart){
    e.preventDefault();
    textDragCurrent = pos(e);
    positionDragPreview(textDragStart, textDragCurrent);
    return;
  }
  if(!drawing) return;
  e.preventDefault();
  const p = pos(e);
  drawSegment(currentStroke.tool, currentStroke.color, currentStroke.size, last.x, last.y, p.x, p.y);
  const sz = getCanvasCssSize();
  currentStroke.points.push(p.x / sz.w, p.y / sz.h);
  last = p;
}

function endDraw(){
  if(tool === 'text' && textDragStart){
    const p1 = textDragStart;
    const p2 = textDragCurrent || textDragStart;
    const w = Math.abs(p2.x - p1.x);
    const h = Math.abs(p2.y - p1.y);
    const origin = { x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y) };
    if(textDragPreview){ textDragPreview.remove(); textDragPreview = null; }
    if(w > 18 && h > 18){
      createTextBox(origin, { width: w });
    } else {
      createTextBox(p1);
    }
    textDragStart = null;
    textDragCurrent = null;
    return;
  }
  if(!drawing) return;
  drawing = false;
  last = null;
  // Um clique sem mover não desenha nada: não vira traço nem entrada de histórico.
  if(currentStroke && currentStroke.points.length >= 4){
    addDrawing(currentStroke);
    pushHistory();
  }
  currentStroke = null;
}

// Descarta um traço que ainda está sendo desenhado (usado quando a lousa é
// restaurada no meio de um gesto, ex.: Ctrl+Z com o mouse ainda pressionado).
export function cancelCurrentStroke(){
  drawing = false;
  last = null;
  currentStroke = null;
}

canvas.addEventListener('mousedown', startDraw);
canvas.addEventListener('mousemove', moveDraw);
window.addEventListener('mouseup', endDraw);
canvas.addEventListener('touchstart', startDraw, {passive:false});
canvas.addEventListener('touchmove', moveDraw, {passive:false});
canvas.addEventListener('touchend', endDraw);

// Tools
const penBtn = document.getElementById('penBtn');
const eraserBtn = document.getElementById('eraserBtn');
const textBtn = document.getElementById('textBtn');
const boardWrapEl = document.querySelector('.board-wrap');

export function setTool(t){
  tool = t;
  penBtn.classList.toggle('active', t === 'pen');
  eraserBtn.classList.toggle('active', t === 'eraser');
  textBtn.classList.toggle('active', t === 'text');
  canvas.style.cursor = t === 'eraser' ? 'cell' : (t === 'text' ? 'text' : 'crosshair');
  // Com a caneta/borracha ativa, o giz passa a desenhar por cima das imagens e caixas de texto.
  boardWrapEl.classList.toggle('drawing-mode', t === 'pen' || t === 'eraser');
}
penBtn.addEventListener('click', () => setTool('pen'));
eraserBtn.addEventListener('click', () => setTool('eraser'));
textBtn.addEventListener('click', () => setTool('text'));

// Helpers de cor hexadecimal
export function isValidHex(v){ return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v); }
export function normalizeHex(v){
  let h = v.replace('#', '');
  if(h.length === 3) h = h.split('').map(c => c + c).join('');
  return '#' + h.toLowerCase();
}

// Colors
const chalkGroup = document.getElementById('chalkGroup');
const chalkColorPicker = document.getElementById('chalkColorPicker');
const chalkHexInput = document.getElementById('chalkHexInput');

function applyChalkColor(hex){
  color = hex;
  chalkGroup.querySelectorAll('.chalk').forEach(c => c.classList.remove('active'));
  chalkColorPicker.value = normalizeHex(hex);
  chalkHexInput.value = hex;
  setTool('pen');
  updateSizePreview();
}

chalkGroup.addEventListener('click', function(e){
  const btn = e.target.closest('.chalk');
  if(!btn) return;
  color = btn.dataset.color;
  chalkGroup.querySelectorAll('.chalk').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  chalkColorPicker.value = normalizeHex(color);
  chalkHexInput.value = color;
  setTool('pen');
  updateSizePreview();
});

chalkColorPicker.addEventListener('input', function(){
  applyChalkColor(chalkColorPicker.value);
});

function commitChalkHex(){
  let v = chalkHexInput.value.trim();
  if(v && v[0] !== '#') v = '#' + v;
  if(isValidHex(v)){
    applyChalkColor(normalizeHex(v));
  } else {
    chalkHexInput.value = color;
  }
}
chalkHexInput.addEventListener('change', commitChalkHex);
chalkHexInput.addEventListener('keydown', function(e){
  if(e.key === 'Enter'){ e.preventDefault(); commitChalkHex(); chalkHexInput.blur(); }
});

// Size
const sizeRange = document.getElementById('sizeRange');
const sizePreview = document.getElementById('sizePreview');
export function updateSizePreview(){
  const s = Math.max(4, Math.min(16, size));
  sizePreview.style.width = s + 'px';
  sizePreview.style.height = s + 'px';
  const eraserPreview = {green:'#20463a', black:'#1c1c1c', white:'#f7f7f2', grid:'#f7f7f2', lined:'#f7f7f2', dots:'#f7f7f2', custom:'#b9b3a2'};
  sizePreview.style.background = tool === 'eraser' ? eraserPreview[bgMode] : color;
}
sizeRange.addEventListener('input', function(){
  size = parseInt(this.value, 10);
  updateSizePreview();
});
