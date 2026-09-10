// background.js
// Fundos disponíveis da lousa, alteração do fundo, imagem de fundo
// (upload, zoom, posicionamento) e reset dos ajustes de imagem de fundo.

import { boardBg, bgCtx, clearStrokes, registerBackgroundPainter } from './canvas.js';
import { pushHistory } from './history.js';
import { updateSizePreview } from './drawing.js';

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
function drawCustomImage(w,h){
  // "moldura" atrás da imagem: aparece quando o zoom deixa a imagem menor que a lousa
  bgCtx.fillStyle = '#2a1c11';
  bgCtx.fillRect(0, 0, w, h);
  if(!customBgImage) return;
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
  if(!btn) return;
  if(btn.dataset.bg === bgMode) return;
  bgMode = btn.dataset.bg;
  bgGroup.querySelectorAll('.bg-swatch').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  setBgAdjustVisible(false);
  pushHistory();
  clearStrokes();
  paintBackground();
  pushHistory();
  if(typeof updateSizePreview === 'function') updateSizePreview();
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

function setBgAdjustVisible(show){
  bgAdjustPanel.style.display = show ? 'flex' : 'none';
  bgAdjustDivider.style.display = show ? 'block' : 'none';
}

function resetBgAdjustControls(){
  customBgTransform = { zoom: 1, offsetX: 0.5, offsetY: 0.5 };
  bgZoomRange.value = 100;
  bgPosXRange.value = 50;
  bgPosYRange.value = 50;
}

bgUploadInput.addEventListener('change', function(e){
  const file = e.target.files && e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(ev){
    const img = new Image();
    img.onload = function(){
      customBgImage = img;
      bgMode = 'custom';
      resetBgAdjustControls();
      bgGroup.querySelectorAll('.bg-swatch').forEach(b => b.classList.remove('active'));
      bgUploadLabel.classList.add('active', 'has-image');
      bgUploadLabel.style.backgroundImage = "url('" + ev.target.result + "')";
      setBgAdjustVisible(true);
      pushHistory();
      clearStrokes();
      paintBackground();
      pushHistory();
      updateSizePreview();
    };
    img.onerror = function(){ alert('Não foi possível carregar essa imagem. Tente outro arquivo.'); };
    img.src = ev.target.result;
  };
  reader.onerror = function(){ alert('Não foi possível ler o arquivo selecionado.'); };
  reader.readAsDataURL(file);
  bgUploadInput.value = '';
});

bgZoomRange.addEventListener('input', function(){
  customBgTransform.zoom = parseInt(bgZoomRange.value, 10) / 100;
  paintBackground();
});
bgPosXRange.addEventListener('input', function(){
  customBgTransform.offsetX = parseInt(bgPosXRange.value, 10) / 100;
  paintBackground();
});
bgPosYRange.addEventListener('input', function(){
  customBgTransform.offsetY = parseInt(bgPosYRange.value, 10) / 100;
  paintBackground();
});
bgResetAdjust.addEventListener('click', function(){
  resetBgAdjustControls();
  paintBackground();
});
