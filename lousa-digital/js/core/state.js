// core/state.js
// Estado central da lousa (fonte única da verdade para o conteúdo "lógico" da lousa).
//
// Este módulo é PURO: não importa nenhum outro módulo e não toca no DOM.
// Isso evita dependências circulares (todos os outros módulos podem importá-lo
// com segurança) e deixa o estado pronto para ser serializado no futuro.
//
// Formato do estado:
//   {
//     version: 1,
//     title: 'lousa',                                      // título da lousa
//     titleStyle: { fontFamily, textAlign },               // aparência do título
//     background: { mode, custom: { src, zoom, offsetX, offsetY } },
//     drawings:   [ { id, tool, color, size, points } ],   // traços de giz/borracha
//     texts:      [ { id, left, top, width, height, zIndex, html, style } ],
//     images:     [ { id, src, left, top, width, height, zIndex } ]
//   }
//
// Convenções:
//  - drawings[].points é uma lista plana [x0, y0, x1, y1, ...] com coordenadas
//    NORMALIZADAS (0..1) em relação ao tamanho do canvas. Assim os traços
//    acompanham o redimensionamento da janela, como acontecia antes com o bitmap.
//  - texts/images: left/top em % da camada de texto; width/height em px
//    (null quando a altura/largura ainda é automática).
//  - A ordem dos arrays é a ordem de criação (drawings: ordem de renderização).
//
// Regra de uso: nenhum módulo deve alterar o objeto retornado por getState().
// Toda mudança passa pelas funções exportadas abaixo.

// Versão do formato do estado. Também é a versão gravada nos arquivos de projeto
// (.lousa, ver project/save.js): ao mudar a estrutura, incremente e adicione uma
// migração em project/load.js.
export const STATE_VERSION = 1;

export const DEFAULT_TITLE = 'lousa';
export const DEFAULT_TITLE_STYLE = Object.freeze({ fontFamily: "'Caveat', cursive", textAlign: 'left' });

const DEFAULT_CUSTOM_BG = Object.freeze({ src: null, zoom: 1, offsetX: 0.5, offsetY: 0.5 });

// Estado inicial de uma lousa nova (usado também para "Novo projeto").
export function createEmptyState(){
  return {
    version: STATE_VERSION,
    title: DEFAULT_TITLE,
    titleStyle: { fontFamily: DEFAULT_TITLE_STYLE.fontFamily, textAlign: DEFAULT_TITLE_STYLE.textAlign },
    background: {
      mode: 'green',
      custom: { src: DEFAULT_CUSTOM_BG.src, zoom: DEFAULT_CUSTOM_BG.zoom, offsetX: DEFAULT_CUSTOM_BG.offsetX, offsetY: DEFAULT_CUSTOM_BG.offsetY }
    },
    drawings: [],
    texts: [],
    images: []
  };
}

// ---------- Cópia profunda ----------
// Cópia profunda de dados simples (objetos, arrays e primitivos). Strings são
// imutáveis em JS, então imagens em base64 (data URLs) NÃO são duplicadas em
// memória a cada snapshot — apenas a estrutura ao redor delas é copiada.
// (JSON.parse(JSON.stringify()) e structuredClone() duplicariam essas strings
// grandes a cada entrada do histórico.)
export function deepClone(value){
  if(Array.isArray(value)){
    const out = value.slice();
    for(let i = 0; i < out.length; i++){
      const item = out[i];
      if(item !== null && typeof item === 'object') out[i] = deepClone(item);
    }
    return out;
  }
  if(value !== null && typeof value === 'object'){
    const out = {};
    const keys = Object.keys(value);
    for(let i = 0; i < keys.length; i++) out[keys[i]] = deepClone(value[keys[i]]);
    return out;
  }
  return value;
}

// Compara dois dados simples (objetos/arrays/primitivos) em profundidade.
// Números são considerados iguais se diferirem por menos de 1e-6 (evita
// "mudanças" fantasmas por arredondamento de porcentagens do CSS).
// `ignoreKeys` lista chaves de PRIMEIRO nível a desconsiderar (ex.: ['zIndex']).
export function entriesEqual(a, b, ignoreKeys){
  const ignore = ignoreKeys || [];
  if(typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-6;
  if(a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b;
  if(Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a).filter(function(k){ return ignore.indexOf(k) === -1; });
  const keysB = Object.keys(b).filter(function(k){ return ignore.indexOf(k) === -1; });
  if(keysA.length !== keysB.length) return false;
  for(let i = 0; i < keysA.length; i++){
    const k = keysA[i];
    if(!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if(!entriesEqual(a[k], b[k])) return false;
  }
  return true;
}

// ---------- Estado vivo ----------
let boardState = createEmptyState();

// Contador incrementado a cada mudança real do estado. O histórico usa isso
// para não gravar entradas repetidas quando nada mudou.
let revision = 0;
function touch(){ revision++; }
export function getRevision(){ return revision; }

// Marca que uma restauração completa está em andamento. Enquanto ela dura,
// os módulos ignoram eventos disparados pela própria restauração (ex.: blur
// de caixas de texto sendo removidas) para não gerar mudanças/histórico falsos.
let restoring = false;
export function beginRestore(){ restoring = true; }
export function endRestore(){ restoring = false; }
export function isRestoring(){ return restoring; }

// ---------- IDs ----------
const idCounters = { d: 0, tb: 0, ib: 0 };
export function nextId(prefix){
  idCounters[prefix] = (idCounters[prefix] || 0) + 1;
  return prefix + idCounters[prefix];
}
function syncIdCounters(state){
  // Garante que novos IDs nunca colidam com IDs já presentes no estado.
  const scan = function(list, prefix){
    list.forEach(function(item){
      const m = item && typeof item.id === 'string' && item.id.indexOf(prefix) === 0
        ? parseInt(item.id.slice(prefix.length), 10) : NaN;
      if(!isNaN(m) && m > (idCounters[prefix] || 0)) idCounters[prefix] = m;
    });
  };
  scan(state.drawings, 'd');
  scan(state.texts, 'tb');
  scan(state.images, 'ib');
}

// ---------- Leitura ----------
// Referência ao estado vivo. SOMENTE LEITURA: não modifique diretamente.
export function getState(){ return boardState; }

// Cópia profunda independente do estado (usada pelo histórico).
export function getStateSnapshot(){ return deepClone(boardState); }

export function getBackground(){ return boardState.background; }
export function getDrawings(){ return boardState.drawings; }
export function getTexts(){ return boardState.texts; }
export function getImages(){ return boardState.images; }

// ---------- Substituição / atualização geral ----------
function normalizeState(input){
  const base = createEmptyState();
  const src = input || {};
  const bg = src.background || {};
  const custom = bg.custom || {};
  const titleStyle = src.titleStyle || {};
  return {
    version: STATE_VERSION,
    title: typeof src.title === 'string' ? src.title : base.title,
    titleStyle: {
      fontFamily: typeof titleStyle.fontFamily === 'string' ? titleStyle.fontFamily : base.titleStyle.fontFamily,
      textAlign: typeof titleStyle.textAlign === 'string' ? titleStyle.textAlign : base.titleStyle.textAlign
    },
    background: {
      mode: typeof bg.mode === 'string' ? bg.mode : base.background.mode,
      custom: {
        src: typeof custom.src === 'string' ? custom.src : null,
        zoom: typeof custom.zoom === 'number' ? custom.zoom : DEFAULT_CUSTOM_BG.zoom,
        offsetX: typeof custom.offsetX === 'number' ? custom.offsetX : DEFAULT_CUSTOM_BG.offsetX,
        offsetY: typeof custom.offsetY === 'number' ? custom.offsetY : DEFAULT_CUSTOM_BG.offsetY
      }
    },
    drawings: Array.isArray(src.drawings) ? src.drawings : [],
    texts: Array.isArray(src.texts) ? src.texts : [],
    images: Array.isArray(src.images) ? src.images : []
  };
}

// Substitui todo o estado por uma cópia profunda de `next`.
// (Nunca guarda a referência recebida, evitando compartilhar objetos com snapshots.)
export function setState(next){
  boardState = normalizeState(deepClone(next));
  syncIdCounters(boardState);
  touch();
}

// Atualização parcial de nível superior: updateState({ background: {...} }).
// Só as chaves informadas (background/drawings/texts/images) são substituídas.
export function updateState(partial){
  if(!partial) return;
  const merged = {
    version: STATE_VERSION,
    title: 'title' in partial ? partial.title : boardState.title,
    titleStyle: 'titleStyle' in partial ? partial.titleStyle : boardState.titleStyle,
    background: 'background' in partial ? partial.background : boardState.background,
    drawings: 'drawings' in partial ? partial.drawings : boardState.drawings,
    texts: 'texts' in partial ? partial.texts : boardState.texts,
    images: 'images' in partial ? partial.images : boardState.images
  };
  setState(merged);
}

// Limpa o estado. Com { keepBackground: true } e/ou { keepTitle: true } preserva
// o fundo e/ou o título (e seu estilo): "Limpar lousa" remove só o conteúdo
// (desenhos, textos e imagens).
export function clearState(options){
  const keepBackground = !!(options && options.keepBackground);
  const keepTitle = !!(options && options.keepTitle);
  const bg = boardState.background;
  const title = boardState.title;
  const titleStyle = boardState.titleStyle;
  boardState = createEmptyState();
  if(keepBackground) boardState.background = bg;
  if(keepTitle){ boardState.title = title; boardState.titleStyle = titleStyle; }
  touch();
}

export function isBoardEmpty(){
  return boardState.drawings.length === 0 && boardState.texts.length === 0 && boardState.images.length === 0;
}

// ---------- Título ----------
export function getTitle(){ return boardState.title; }
export function getTitleStyle(){ return boardState.titleStyle; }

// Retorna true se algo mudou.
export function setTitle(title){
  if(typeof title !== 'string' || title === boardState.title) return false;
  boardState.title = title;
  touch();
  return true;
}
// setTitleStyle({ fontFamily }) / setTitleStyle({ textAlign }). Retorna true se algo mudou.
export function setTitleStyle(patch){
  let changed = false;
  ['fontFamily', 'textAlign'].forEach(function(key){
    if(patch && typeof patch[key] === 'string' && patch[key] !== boardState.titleStyle[key]){
      boardState.titleStyle[key] = patch[key];
      changed = true;
    }
  });
  if(changed) touch();
  return changed;
}

// ---------- Desenhos ----------
export function addDrawing(drawing){
  const entry = deepClone(drawing);
  if(!entry.id) entry.id = nextId('d');
  boardState.drawings.push(entry);
  touch();
  return entry.id;
}
export function removeDrawing(id){
  const before = boardState.drawings.length;
  boardState.drawings = boardState.drawings.filter(function(d){ return d.id !== id; });
  if(boardState.drawings.length !== before) touch();
}
export function clearDrawings(){
  if(boardState.drawings.length === 0) return;
  boardState.drawings = [];
  touch();
}

// ---------- Textos ----------
export function getText(id){
  return boardState.texts.find(function(t){ return t.id === id; }) || null;
}
export function hasText(id){ return getText(id) !== null; }
export function addText(text){
  const entry = deepClone(text);
  if(!entry.id) entry.id = nextId('tb');
  boardState.texts.push(entry);
  touch();
  return entry.id;
}
export function updateText(id, patch){
  const idx = boardState.texts.findIndex(function(t){ return t.id === id; });
  if(idx === -1) return false;
  boardState.texts[idx] = Object.assign({}, boardState.texts[idx], deepClone(patch), { id: id });
  touch();
  return true;
}
export function removeText(id){
  const before = boardState.texts.length;
  boardState.texts = boardState.texts.filter(function(t){ return t.id !== id; });
  if(boardState.texts.length !== before) touch();
}
export function clearTexts(){
  if(boardState.texts.length === 0) return;
  boardState.texts = [];
  touch();
}

// ---------- Imagens ----------
export function getImage(id){
  return boardState.images.find(function(i){ return i.id === id; }) || null;
}
export function hasImage(id){ return getImage(id) !== null; }
export function addImage(image){
  const entry = deepClone(image);
  if(!entry.id) entry.id = nextId('ib');
  boardState.images.push(entry);
  touch();
  return entry.id;
}
export function updateImage(id, patch){
  const idx = boardState.images.findIndex(function(i){ return i.id === id; });
  if(idx === -1) return false;
  boardState.images[idx] = Object.assign({}, boardState.images[idx], deepClone(patch), { id: id });
  touch();
  return true;
}
export function removeImage(id){
  const before = boardState.images.length;
  boardState.images = boardState.images.filter(function(i){ return i.id !== id; });
  if(boardState.images.length !== before) touch();
}
export function clearImages(){
  if(boardState.images.length === 0) return;
  boardState.images = [];
  touch();
}

// ---------- Background ----------
// Mescla parcialmente o fundo: setBackground({ mode: 'grid' }) ou
// setBackground({ custom: { zoom: 1.5 } }). Só conta como mudança se algum
// valor realmente mudou.
export function setBackground(patch){
  const bg = boardState.background;
  let changed = false;
  if(patch && typeof patch.mode === 'string' && patch.mode !== bg.mode){
    bg.mode = patch.mode;
    changed = true;
  }
  if(patch && patch.custom){
    Object.keys(patch.custom).forEach(function(key){
      if(bg.custom[key] !== patch.custom[key]){
        bg.custom[key] = patch.custom[key];
        changed = true;
      }
    });
  }
  if(changed) touch();
  return changed;
}

// Redefine só os ajustes (zoom/posição) da imagem de fundo personalizada.
export function resetBackgroundAdjust(){
  return setBackground({ custom: { zoom: DEFAULT_CUSTOM_BG.zoom, offsetX: DEFAULT_CUSTOM_BG.offsetX, offsetY: DEFAULT_CUSTOM_BG.offsetY } });
}
