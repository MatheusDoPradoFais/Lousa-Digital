// background.js
// Fundos disponíveis da lousa, alteração do fundo, imagem de fundo
// (upload, zoom, posicionamento) e reset dos ajustes de imagem de fundo.

import { boardBg, bgCtx, renderDrawings, registerBackgroundPainter } from './canvas.js';
import { pushHistory } from './history.js';
import { updateSizePreview } from './drawing.js';
import { getBackground, setBackground, resetBackgroundAdjust, clearDrawings } from './core/state.js';

// O fundo "de verdade" vive no estado central (core/state.js → background).
// As variáveis abaixo são apenas o espelho usado na hora de pintar; elas são
// sempre atualizadas por applyBackground(), a partir do estado.
export let bgMode = 'green';

export const CSS_BG = {
  green: 'radial-gradient(140% 100% at 15% 0%, #20463a 0%, #173229 55%, #122720 100%)',
  black: 'radial-gradient(140% 100% at 15% 0%, #2b2b2b 0%, #1c1c1c 55%, #111111 100%)',
  white: '#f7f7f2',
  grid: '#f7f7f2',
  lined: '#f7f7f2',
  dots: '#f7f7f2'
};

function drawGreenboard(w,h){
  const g = bgCtx.createRadialGradient(w*0.15,0,w*0.05, w*0.15,0,w*1.1);
  g.addColorStop(0,'#20463a'); g.addColorStop(0.55,'#173229'); g.addColorStop(1,'#122720');
  bgCtx.fillStyle = g; bgCtx.fillRect(0,0,w,h);
}
function drawBlackboard(w,h){
  const g = bgCtx.createRadialGradient(w*0.15,0,w*0.05, w*0.15,0,w*1.1);
  g.addColorStop(0,'#2b2b2b'); g.addColorStop(0.55,'#1c1c1c'); g.addColorStop(1,'#111111');
  bgCtx.fillStyle = g; bgCtx.fillRect(0,0,w,h);
}
function drawWhiteboard(w,h){
  bgCtx.fillStyle = '#f7f7f2';
  bgCtx.fillRect(0,0,w,h);
  const g = bgCtx.createRadialGradient(w*0.5,h*0.5,Math.min(w,h)*0.2, w*0.5,h*0.5, Math.max(w,h)*0.75);
  g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,'rgba(0,0,0,0.05)');
  bgCtx.fillStyle = g; bgCtx.fillRect(0,0,w,h);
}
function drawGrid(w,h,dpr){
  drawWhiteboard(w,h);
  const step = 28*dpr;
  bgCtx.strokeStyle = 'rgba(70,110,150,0.22)';
  bgCtx.lineWidth = Math.max(1, dpr);
  bgCtx.beginPath();
  for(let x=step; x<w; x+=step){ bgCtx.moveTo(x,0); bgCtx.lineTo(x,h); }
  for(let y=step; y<h; y+=step){ bgCtx.moveTo(0,y); bgCtx.lineTo(w,y); }
  bgCtx.stroke();
}
function drawLined(w,h,dpr){
  drawWhiteboard(w,h);
  const step = 38*dpr;
  bgCtx.strokeStyle = 'rgba(70,110,180,0.28)';
  bgCtx.lineWidth = Math.max(1, dpr);
  bgCtx.beginPath();
  for(let y=step; y<h; y+=step){ bgCtx.moveTo(0,y); bgCtx.lineTo(w,y); }
  bgCtx.stroke();
  bgCtx.strokeStyle = 'rgba(220,90,90,0.35)';
  bgCtx.beginPath();
  const mx = 46*dpr;
  bgCtx.moveTo(mx,0); bgCtx.lineTo(mx,h);
  bgCtx.stroke();
}
function drawDots(w,h,dpr){
  drawWhiteboard(w,h);
  const step = 26*dpr;
  bgCtx.fillStyle = 'rgba(70,90,120,0.32)';
  const r = Math.max(1, 1.4*dpr);
  for(let x=step; x<w; x+=step){
    for(let y=step; y<h; y+=step){
      bgCtx.beginPath(); bgCtx.arc(x,y,r,0,Math.PI*2); bgCtx.fill();
    }
  }
}

let customBgImage = null;
let customBgTransform = { zoom: 1, offsetX: 0.5, offsetY: 0.5 };

// Imagens de fundo já decodificadas, por src (data URL). Evita recarregar a
// imagem a cada undo/redo, mantendo a restauração do fundo instantânea.
const bgImageCache = new Map();
function getBgImage(src){
  if(!src) return null;
  let img = bgImageCache.get(src);
  if(!img){
    img = new Image();
    bgImageCache.set(src, img);
    img.onload = function(){ if(customBgImage === img) paintBackground(); };
    img.src = src;
  }
  return img;
}
function drawCustomImage(w,h){
  // "moldura" atrás da imagem: aparece quando o zoom deixa a imagem menor que a lousa
  bgCtx.fillStyle = '#2a1c11';
  bgCtx.fillRect(0, 0, w, h);
  if(!customBgImage || !customBgImage.complete || !customBgImage.naturalWidth) return;
  const img = customBgImage;
  const baseScale = Math.max(w / img.width, h / img.height);
  const scale = baseScale * (customBgTransform.zoom || 1);
  const dw = img.width * scale;
  const dh = img.height * scale;
  // offsetX/offsetY tanto posicionam a imagem (quando menor que a lousa)
  // quanto fazem o "pan" pelo recorte (quando maior que a lousa)
  const dx = (w - dw) * customBgTransform.offsetX;
  const dy = (h - dh) * customBgTransform.offsetY;
  bgCtx.drawImage(img, 0, 0, img.width, img.height, dx, dy, dw, dh);
}

const BG_PRESETS = {
  green: (w,h,dpr) => drawGreenboard(w,h),
  black: (w,h,dpr) => drawBlackboard(w,h),
  white: (w,h,dpr) => drawWhiteboard(w,h),
  grid:  (w,h,dpr) => drawGrid(w,h,dpr),
  lined: (w,h,dpr) => drawLined(w,h,dpr),
  dots:  (w,h,dpr) => drawDots(w,h,dpr),
  custom: (w,h,dpr) => drawCustomImage(w,h)
};

export function paintBackground(){
  bgCtx.save();
  bgCtx.setTransform(1,0,0,1,0,0);
  BG_PRESETS[bgMode](boardBg.width, boardBg.height, window.devicePixelRatio || 1);
  bgCtx.restore();
}

// Registra esta função em canvas.js, para que setupCanvas() consiga
// repintar o fundo sem que canvas.js precise importar background.js
// (o que criaria uma dependência circular entre os dois módulos).
registerBackgroundPainter(paintBackground);

// Background presets
const bgGroup = document.getElementById('bgGroup');
bgGroup.addEventListener('click', function(e){
  const btn = e.target.closest('.bg-swatch');
  // O "swatch" de upload (label com o input de arquivo) não tem data-bg: clicar
  // nele só abre o seletor de arquivos e não deve trocar/limpar nada.
  if(!btn || !btn.dataset.bg) return;
  if(btn.dataset.bg === bgMode) return;
  // Trocar o fundo continua limpando os traços (comportamento original), mas
  // agora é uma única ação no histórico: um Ctrl+Z restaura fundo E desenhos.
  setBackground({ mode: btn.dataset.bg });
  clearDrawings();
  applyBackground(getBackground());
  renderDrawings();
  pushHistory();
});

// Upload de imagem de fundo do computador
const bgUploadInput = document.getElementById('bgUploadInput');
const bgUploadLabel = document.getElementById('bgUploadLabel');
const bgAdjustPanel = document.getElementById('bgAdjustPanel');
const bgAdjustDivider = document.getElementById('bgAdjustDivider');
const bgZoomRange = document.getElementById('bgZoomRange');
const bgPosXRange = document.getElementById('bgPosXRange');
const bgPosYRange = document.getElementById('bgPosYRange');
const bgResetAdjust = document.getElementById('bgResetAdjust');

let thumbSrc = null; // src da miniatura atual (evita reatribuir data URLs grandes a cada ajuste)

function setBgAdjustVisible(show){
  bgAdjustPanel.style.display = show ? 'flex' : 'none';
  bgAdjustDivider.style.display = show ? 'block' : 'none';
}

// Sincroniza TODA a interface do fundo (botões, miniatura, painel de ajuste,
// sliders) e repinta o canvas de fundo a partir de um objeto `background` do estado.
// É o único caminho para aplicar um fundo — usado tanto pelas ações do usuário
// quanto pela restauração (undo/redo).
export function applyBackground(bg){
  bgMode = bg.mode;
  customBgTransform = { zoom: bg.custom.zoom, offsetX: bg.custom.offsetX, offsetY: bg.custom.offsetY };
  customBgImage = getBgImage(bg.custom.src);

  bgGroup.querySelectorAll('.bg-swatch').forEach(b => b.classList.remove('active'));
  if(bg.mode === 'custom'){
    bgUploadLabel.classList.add('active');
  } else {
    const btn = bgGroup.querySelector('.bg-swatch[data-bg="' + bg.mode + '"]');
    if(btn) btn.classList.add('active');
  }
  if(bg.custom.src){
    bgUploadLabel.classList.add('has-image');
    if(thumbSrc !== bg.custom.src){
      thumbSrc = bg.custom.src;
      bgUploadLabel.style.backgroundImage = "url('" + bg.custom.src + "')";
    }
  } else {
    bgUploadLabel.classList.remove('has-image');
    bgUploadLabel.style.backgroundImage = '';
    thumbSrc = null;
  }
  setBgAdjustVisible(bg.mode === 'custom');
  bgZoomRange.value = Math.round(bg.custom.zoom * 100);
  bgPosXRange.value = Math.round(bg.custom.offsetX * 100);
  bgPosYRange.value = Math.round(bg.custom.offsetY * 100);

  paintBackground();
  updateSizePreview();
}

bgUploadInput.addEventListener('change', function(e){
  const file = e.target.files && e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(ev){
    const img = new Image();
    img.onload = function(){
      bgImageCache.set(ev.target.result, img);
      setBackground({ mode: 'custom', custom: { src: ev.target.result, zoom: 1, offsetX: 0.5, offsetY: 0.5 } });
      clearDrawings();
      applyBackground(getBackground());
      renderDrawings();
      pushHistory();
    };
    img.onerror = function(){ alert('Não foi possível carregar essa imagem. Tente outro arquivo.'); };
    img.src = ev.target.result;
  };
  reader.onerror = function(){ alert('Não foi possível ler o arquivo selecionado.'); };
  reader.readAsDataURL(file);
  bgUploadInput.value = '';
});

// Sliders de zoom/posição: "input" atualiza o estado e repinta ao vivo (caminho
// leve, só o canvas de fundo); o histórico só ganha UMA entrada quando o usuário
// solta o controle ("change").
function updateCustomAdjust(patch){
  setBackground({ custom: patch });
  const c = getBackground().custom;
  customBgTransform = { zoom: c.zoom, offsetX: c.offsetX, offsetY: c.offsetY };
  paintBackground();
}
bgZoomRange.addEventListener('input', function(){
  updateCustomAdjust({ zoom: parseInt(bgZoomRange.value, 10) / 100 });
});
bgPosXRange.addEventListener('input', function(){
  updateCustomAdjust({ offsetX: parseInt(bgPosXRange.value, 10) / 100 });
});
bgPosYRange.addEventListener('input', function(){
  updateCustomAdjust({ offsetY: parseInt(bgPosYRange.value, 10) / 100 });
});
[bgZoomRange, bgPosXRange, bgPosYRange].forEach(function(range){
  range.addEventListener('change', pushHistory);
});
bgResetAdjust.addEventListener('click', function(){
  resetBackgroundAdjust();
  applyBackground(getBackground());
  pushHistory();
});
