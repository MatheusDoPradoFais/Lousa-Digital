// history.js
// Histórico de desenho: undo, redo e atalhos de teclado relacionados.

import { canvas, ctx, clearStrokes } from './canvas.js';

let undoStack = [];
let redoStack = [];
const MAX_HISTORY = 40;

const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');

export function pushHistory(){
  try{
    undoStack.push(canvas.toDataURL());
    if(undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack = [];
    updateHistoryButtons();
  }catch(e){}
}

function restoreFrom(dataUrl){
  const img = new Image();
  img.onload = function(){
    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  };
  img.src = dataUrl;
}

export function updateHistoryButtons(){
  undoBtn.disabled = undoStack.length === 0;
  redoBtn.disabled = redoStack.length === 0;
}

// Undo / redo
undoBtn.addEventListener('click', function(){
  if(undoStack.length === 0) return;
  const cur = canvas.toDataURL();
  redoStack.push(cur);
  const prev = undoStack.pop();
  if(undoStack.length === 0){
    clearStrokes();
  } else {
    restoreFrom(undoStack[undoStack.length - 1]);
  }
  updateHistoryButtons();
});

redoBtn.addEventListener('click', function(){
  if(redoStack.length === 0) return;
  const next = redoStack.pop();
  undoStack.push(next);
  restoreFrom(next);
  updateHistoryButtons();
});

document.addEventListener('keydown', function(e){
  if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z'){
    e.preventDefault();
    undoBtn.click();
  }
  if((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase()==='z'))){
    e.preventDefault();
    redoBtn.click();
  }
});
