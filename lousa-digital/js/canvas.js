// canvas.js
// Configuração dos canvas (lousa e fundo), dimensionamento, devicePixelRatio
// e redimensionamento responsivo da área de desenho.
//
// Observação sobre módulos: canvas.js é usado por praticamente todos os
// outros módulos (background, drawing, text, images, history). Para evitar
// uma dependência circular na hora de carregar os módulos ES (o que causaria
// erro de "acesso antes da inicialização"), canvas.js não importa
// background.js nem text.js diretamente. Em vez disso, esses módulos se
// registram aqui através de pequenas funções de registro, para que
// setupCanvas()/syncOverlayLayers() consigam chamar paintBackground() e
// updateToolbarPosition() sem criar um import circular.
//
// Desenhos: os traços vivem no estado central (core/state.js) como dados
// vetoriais e o canvas é apenas uma "renderização" deles. Por isso o
// redimensionamento e a restauração (undo/redo) repintam a partir do estado
// em vez de copiar o bitmap. state.js não importa nada, então não há ciclo.
import { getDrawings } from './core/state.js';

let _paintBackground = function(){};
export function registerBackgroundPainter(fn){ _paintBackground = fn; }

let _getCurrentBox = function(){ return null; };
let _updateToolbarPosition = function(){};
export function registerTextBoxHooks(getCurrentBoxFn, updateToolbarPositionFn){
  _getCurrentBox = getCurrentBoxFn;
  _updateToolbarPosition = updateToolbarPositionFn;
}

export const canvas = document.getElementById('board');
export const ctx = canvas.getContext('2d');
export const boardBg = document.getElementById('boardBg');
export const bgCtx = boardBg.getContext('2d');
export const wrap = canvas.parentElement;
export const textLayer = document.getElementById('textLayer');
export const textToolbar = document.getElementById('textToolbar');

// O quadro tem DUAS camadas:
// - boardBg: pinta a cor/padrão da lousa (verde, preta, quadriculada...) e nunca é tocada pela borracha.
// - board (canvas principal): só contém os traços de giz, sobre fundo transparente.
// Assim, a borracha (destination-out) revela sempre a cor/padrão correta da lousa por baixo,
// em vez de apagar para transparente e depender de um CSS de fallback.

export function clearStrokes(){
  ctx.save();
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

// Tamanho do canvas em px CSS (o mesmo espaço de coordenadas do ctx, que usa scale(dpr)).
export function getCanvasCssSize(){
  const dpr = window.devicePixelRatio || 1;
  return { w: canvas.width / dpr, h: canvas.height / dpr };
}

// Desenha UM segmento de giz/borracha. É usado tanto ao desenhar ao vivo quanto
// ao repintar traços do estado, garantindo que o resultado seja idêntico.
// Coordenadas em px CSS.
export function drawSegment(tool, color, size, x0, y0, x1, y1){
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  if(tool === 'eraser'){
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = size * 3;
    ctx.stroke();
    ctx.restore();
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.shadowColor = color;
    ctx.shadowBlur = size * 0.35;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

// Repinta um traço do estado (pontos normalizados 0..1) no canvas.
function renderStroke(stroke, cssW, cssH){
  const pts = stroke.points;
  for(let i = 2; i < pts.length; i += 2){
    drawSegment(stroke.tool, stroke.color, stroke.size,
      pts[i - 2] * cssW, pts[i - 1] * cssH, pts[i] * cssW, pts[i + 1] * cssH);
  }
}

// Limpa o canvas e repinta TODOS os desenhos do estado, na ordem em que foram feitos.
export function renderDrawings(){
  clearStrokes();
  const size = getCanvasCssSize();
  const drawings = getDrawings();
  for(let i = 0; i < drawings.length; i++) renderStroke(drawings[i], size.w, size.h);
}

export function setupCanvas(){
  const dpr = window.devicePixelRatio || 1;
  const rect = wrap.getBoundingClientRect();

  const w = Math.round((rect.width - 28) * dpr);
  const h = Math.round((rect.height - 28) * dpr);

  canvas.width = w;
  canvas.height = h;
  canvas.style.width = (rect.width - 28) + 'px';
  canvas.style.height = (rect.height - 28) + 'px';

  boardBg.width = w;
  boardBg.height = h;

  ctx.setTransform(1,0,0,1,0,0);
  ctx.scale(dpr, dpr);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  bgCtx.setTransform(1,0,0,1,0,0);
  bgCtx.scale(dpr, dpr);

  _paintBackground();

  // Redimensionar o canvas apaga o bitmap: repinta os traços a partir do estado.
  renderDrawings();

  syncOverlayLayers();
}

export function syncOverlayLayers(){
  const wrapRect = wrap.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  const left = (canvasRect.left - wrapRect.left) + 'px';
  const top = (canvasRect.top - wrapRect.top) + 'px';

  boardBg.style.left = left;
  boardBg.style.top = top;
  boardBg.style.width = canvasRect.width + 'px';
  boardBg.style.height = canvasRect.height + 'px';

  textLayer.style.left = left;
  textLayer.style.top = top;
  textLayer.style.width = canvasRect.width + 'px';
  textLayer.style.height = canvasRect.height + 'px';
  const cb = _getCurrentBox();
  if(cb) _updateToolbarPosition(cb);
}

export function pos(e){
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const t = e.touches ? e.touches[0] : e;
  return {
    x: (t.clientX - rect.left),
    y: (t.clientY - rect.top)
  };
}

// Repintar os traços a partir do estado custa mais que copiar um bitmap, então
// agrupa os vários eventos de resize em no máximo um setupCanvas() por quadro.
let resizeQueued = false;
window.addEventListener('resize', function(){
  if(resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(function(){
    resizeQueued = false;
    setupCanvas();
  });
});
