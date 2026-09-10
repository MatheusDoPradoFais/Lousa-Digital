// export.js
// Exportação da lousa para PNG: prepara um canvas temporário e inclui
// título, fundo, desenhos, imagens e textos na imagem final.

import { canvas, boardBg } from './canvas.js';
import { boardLabel, textBoxes } from './text.js';
import { imageBoxes } from './images.js';

const saveBtn = document.getElementById('saveBtn');

// Save (bakes text boxes into the exported image)
saveBtn.addEventListener('click', function(){
  const dpr = window.devicePixelRatio || 1;

  // Espaço reservado no topo da imagem para o título da lousa
  const labelStyle = getComputedStyle(boardLabel);
  const titleText = (boardLabel.textContent || '').replace(/\s+/g, ' ').trim() || 'lousa';
  const titleFontSizeCss = parseFloat(labelStyle.fontSize) || 30;
  const titleBarHeightCss = Math.round(titleFontSizeCss * 1.5 + 30);
  const titleBarHeightPx = Math.round(titleBarHeightCss * dpr);

  const temp = document.createElement('canvas');
  temp.width = canvas.width;
  temp.height = canvas.height + titleBarHeightPx;
  const tctx = temp.getContext('2d');

  tctx.drawImage(boardBg, 0, titleBarHeightPx);
  tctx.drawImage(canvas, 0, titleBarHeightPx);
  tctx.scale(dpr, dpr);

  const cssWidth = temp.width / dpr;

  // Barra com o título da lousa
  tctx.fillStyle = '#3a2617';
  tctx.fillRect(0, 0, cssWidth, titleBarHeightCss);

  const titleItalic = labelStyle.fontStyle === 'italic' ? 'italic ' : '';
  const titleWeight = parseInt(labelStyle.fontWeight, 10) >= 600 ? 'bold ' : '';
  tctx.fillStyle = labelStyle.color;
  tctx.font = titleItalic + titleWeight + titleFontSizeCss + 'px ' + labelStyle.fontFamily;
  tctx.textBaseline = 'middle';
  const titleAlignSaved = boardLabel.style.textAlign || 'left';
  if(titleAlignSaved === 'center'){
    tctx.textAlign = 'center';
    tctx.fillText(titleText, cssWidth / 2, titleBarHeightCss / 2);
  } else if(titleAlignSaved === 'right'){
    tctx.textAlign = 'right';
    tctx.fillText(titleText, cssWidth - 20, titleBarHeightCss / 2);
  } else {
    tctx.textAlign = 'left';
    tctx.fillText(titleText, 20, titleBarHeightCss / 2);
  }
  tctx.textAlign = 'left';

  const canvasRect = canvas.getBoundingClientRect();
  imageBoxes.forEach(function(box){
    const img = box.querySelector('.image-box-content');
    if(!img || !img.complete || !img.naturalWidth) return;
    const rect = img.getBoundingClientRect();
    const x = rect.left - canvasRect.left;
    const y = (rect.top - canvasRect.top) + titleBarHeightCss;
    tctx.drawImage(img, x, y, rect.width, rect.height);
  });
  textBoxes.forEach(function(box){
    const content = box.querySelector('.text-box-content');
    const text = content.innerText;
    if(!text || !text.trim()) return;
    const rect = content.getBoundingClientRect();
    const x = rect.left - canvasRect.left;
    const y = (rect.top - canvasRect.top) + titleBarHeightCss;
    const style = getComputedStyle(content);
    const fontSize = parseFloat(style.fontSize);
    tctx.fillStyle = style.color;
    tctx.font = (style.fontStyle === 'italic' ? 'italic ' : '') +
                (parseInt(style.fontWeight,10) >= 600 ? 'bold ' : '') +
                fontSize + 'px ' + style.fontFamily;
    tctx.textBaseline = 'top';
    text.split('\n').forEach(function(line, i){
      tctx.fillText(line, x, y + i * fontSize * 1.25);
    });
  });

  const link = document.createElement('a');
  link.download = 'lousa-' + Date.now() + '.png';
  link.href = temp.toDataURL('image/png');
  link.click();
});
