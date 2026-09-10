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

export function setupCanvas(preserve){
  const dpr = window.devicePixelRatio || 1;
  const rect = wrap.getBoundingClientRect();
  const prevStrokes = preserve ? canvas.toDataURL() : null;

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

  if(prevStrokes){
    const img = new Image();
    img.onload = function(){
      ctx.save();
      ctx.setTransform(1,0,0,1,0,0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    };
    img.src = prevStrokes;
  } else {
    clearStrokes();
  }

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

window.addEventListener('resize', function(){ setupCanvas(true); });
