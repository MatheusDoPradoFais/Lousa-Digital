// project/save.js
// Gera o arquivo de projeto (.lousa) a partir do estado e o grava no
// computador do usuário, só com APIs nativas do navegador:
//  - File System Access API (Chrome/Edge…): abre a janela "Salvar como" e
//    guarda o arquivo escolhido, permitindo "Salvar" sobrescrever sem novo diálogo;
//  - alternativa (Firefox/Safari…): download de um Blob por <a download>.
//
// Formato do arquivo: JSON de texto puro (legível e à prova de futuro):
//   {
//     "format": "lousa-digital-project",
//     "version": 1,             // versão do formato (ver STATE_VERSION / migrações em load.js)
//     "savedAt": "2026-…",      // informativo
//     "title": "...", "titleStyle": {...},
//     "background": {...}, "drawings": [...], "texts": [...], "images": [...]
//   }

import { STATE_VERSION, DEFAULT_TITLE } from '../core/state.js';

export const FILE_FORMAT = 'lousa-digital-project';
export const FILE_EXTENSION = '.lousa';

export function serializeProject(state){
  return JSON.stringify({
    format: FILE_FORMAT,
    version: STATE_VERSION,
    savedAt: new Date().toISOString(),
    title: state.title,
    titleStyle: state.titleStyle,
    background: state.background,
    drawings: state.drawings,
    texts: state.texts,
    images: state.images
  });
}

// "Aula 1: frações?" → "Aula 1 frações.lousa" (sem caracteres proibidos em nomes de arquivo)
export function makeFileName(base){
  let name = String(base || '')
    .replace(/\.lousa$/i, '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[\s.]+$/g, '')
    .slice(0, 80)
    .trim();
  if(!name) name = 'minha-lousa';
  return name + FILE_EXTENSION;
}

// Nome sugerido a partir do título (o título padrão "lousa" não é um bom nome de arquivo).
export function suggestedFileName(title){
  return makeFileName(!title || title === DEFAULT_TITLE ? 'minha-lousa' : title);
}

export function hasFileSystemAccess(){
  return typeof window.showSaveFilePicker === 'function';
}

const FILE_TYPES = [{ description: 'Projeto da Lousa Digital', accept: { 'application/json': [FILE_EXTENSION] } }];
export { FILE_TYPES };

// Abre a janela nativa "Salvar como". Retorna o handle, ou null se o usuário cancelou.
// Outros erros (ex.: API bloqueada) são repassados para quem chamou decidir a alternativa.
export async function pickSaveHandle(suggestedName){
  try{
    return await window.showSaveFilePicker({ suggestedName: suggestedName, types: FILE_TYPES });
  }catch(err){
    if(err && err.name === 'AbortError') return null;
    throw err;
  }
}

export async function writeToHandle(handle, text){
  const writable = await handle.createWritable();
  try{
    await writable.write(new Blob([text], { type: 'application/json' }));
  }finally{
    await writable.close();
  }
}

// Alternativa sem File System Access API: baixa o arquivo.
export function downloadProject(text, fileName){
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 10000);
}
