// project/load.js
// Abrir um arquivo de projeto (.lousa): escolher o arquivo, ler, VALIDAR,
// migrar de versões antigas e devolver um estado limpo — sem tocar na lousa
// atual. Só depois que tudo é aprovado quem chamou aplica o estado com
// restoreState(). Qualquer problema vira um ProjectFormatError com mensagem
// amigável (e a lousa atual continua intacta).
//
// Segurança: o arquivo é tratado como NÃO CONFIÁVEL. Todo valor é conferido e
// copiado para objetos novos (nada do JSON é reaproveitado como veio), cores e
// estilos passam por listas de valores permitidos, imagens só podem ser
// data URLs de imagem, e o HTML dos textos é filtrado por uma lista de tags.

import { STATE_VERSION, DEFAULT_TITLE, DEFAULT_TITLE_STYLE } from '../core/state.js';
import { FILE_FORMAT, FILE_EXTENSION, FILE_TYPES } from './save.js';

export class ProjectFormatError extends Error {
  constructor(userMessage){
    super(userMessage);
    this.name = 'ProjectFormatError';
    this.userMessage = userMessage;
  }
}
function fail(msg){ throw new ProjectFormatError(msg); }

const MAX_FILE_BYTES = 300 * 1024 * 1024; // proteção contra arquivos absurdos
const NOT_A_PROJECT = 'Este arquivo não é um projeto válido da Lousa Digital, ou o conteúdo está corrompido.';

// ---------- Escolher e ler o arquivo ----------

// Abre o seletor de arquivos. Retorna { file, handle } ou null se cancelou.
// `handle` (File System Access API) permite que "Salvar" depois sobrescreva o mesmo arquivo.
export async function pickProjectFile(){
  if(typeof window.showOpenFilePicker === 'function'){
    try{
      const handles = await window.showOpenFilePicker({ multiple: false, types: FILE_TYPES });
      const handle = handles[0];
      return { file: await handle.getFile(), handle: handle };
    }catch(err){
      if(err && err.name === 'AbortError') return null;
      // API indisponível/bloqueada: segue para o <input type="file"> abaixo
    }
  }
  return new Promise(function(resolve){
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = FILE_EXTENSION + ',application/json';
    input.style.display = 'none';
    document.body.appendChild(input);
    function done(value){ input.remove(); resolve(value); }
    input.addEventListener('change', function(){
      done(input.files && input.files[0] ? { file: input.files[0], handle: null } : null);
    });
    input.addEventListener('cancel', function(){ done(null); });
    input.click();
  });
}

export async function readProjectFile(file){
  if(file.size > MAX_FILE_BYTES) fail('O arquivo é grande demais para ser um projeto da Lousa Digital.');
  if(file.size === 0) fail('O arquivo está vazio.');
  return await file.text();
}

// ---------- Migração entre versões ----------
// Para mudar o formato no futuro: incremente STATE_VERSION (core/state.js) e
// adicione aqui a função que converte a versão anterior. Ex.:
//   MIGRATIONS[1] = function(data){ /* converte v1 → v2 */ return data; };
const MIGRATIONS = {};

function migrate(data){
  while(data.version < STATE_VERSION){
    const step = MIGRATIONS[data.version];
    if(!step) fail('Este projeto foi salvo em um formato antigo que não é mais suportado (versão ' + data.version + ').');
    data = step(data);
    data.version = data.version + 1;
  }
  return data;
}

// ---------- Helpers de validação ----------
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = v => typeof v === 'number' && isFinite(v);
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

function damaged(what, i){
  fail('O projeto está danificado: ' + what + (i !== undefined ? ' nº ' + (i + 1) : '') + ' com dados inválidos.');
}

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const IMAGE_DATA_URL = /^data:image\/[a-z0-9.+-]+[;,]/i;
const BACKGROUND_MODES = ['green', 'black', 'white', 'grid', 'lined', 'dots', 'custom'];
const ALIGNMENTS = ['left', 'center', 'right'];

// Valor de CSS "seguro": curto, só caracteres comuns e sem url()/expression()/escapes.
function cssValue(v, fallback){
  if(typeof v !== 'string') return fallback;
  if(v.length > 120 || !/^[#\w\s.,()%'"-]*$/.test(v) || /url\s*\(|expression\s*\(/i.test(v)) return fallback;
  return v;
}

// ---------- Título ----------
function readTitle(data){
  let title = typeof data.title === 'string' ? data.title.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
  if(!title) title = DEFAULT_TITLE;
  const src = isObj(data.titleStyle) ? data.titleStyle : {};
  const family = cssValue(src.fontFamily, '');
  return {
    title: title,
    titleStyle: {
      fontFamily: family || DEFAULT_TITLE_STYLE.fontFamily,
      textAlign: ALIGNMENTS.indexOf(src.textAlign) !== -1 ? src.textAlign : DEFAULT_TITLE_STYLE.textAlign
    }
  };
}

// ---------- Fundo ----------
function readBackground(bg){
  if(!isObj(bg)) damaged('o fundo');
  if(BACKGROUND_MODES.indexOf(bg.mode) === -1) damaged('o fundo');
  const custom = isObj(bg.custom) ? bg.custom : {};
  let src = null;
  if(custom.src !== null && custom.src !== undefined){
    if(typeof custom.src !== 'string' || !IMAGE_DATA_URL.test(custom.src)) damaged('a imagem de fundo');
    src = custom.src;
  }
  if(bg.mode === 'custom' && !src) damaged('a imagem de fundo');
  return {
    mode: bg.mode,
    custom: {
      src: src,
      zoom: isNum(custom.zoom) ? clamp(custom.zoom, 0.1, 10) : 1,
      offsetX: isNum(custom.offsetX) ? clamp(custom.offsetX, 0, 1) : 0.5,
      offsetY: isNum(custom.offsetY) ? clamp(custom.offsetY, 0, 1) : 0.5
    }
  };
}

// ---------- Desenhos ----------
function readDrawings(list){
  if(!Array.isArray(list)) damaged('a lista de desenhos');
  return list.map(function(d, i){
    if(!isObj(d)) damaged('o desenho', i);
    if(d.tool !== 'pen' && d.tool !== 'eraser') damaged('o desenho', i);
    if(typeof d.color !== 'string' || !HEX_COLOR.test(d.color)) damaged('o desenho', i);
    if(!isNum(d.size) || d.size <= 0 || d.size > 200) damaged('o desenho', i);
    const pts = d.points;
    if(!Array.isArray(pts) || pts.length < 4 || pts.length % 2 !== 0) damaged('o desenho', i);
    const points = new Array(pts.length);
    for(let k = 0; k < pts.length; k++){
      const n = pts[k];
      if(!isNum(n) || n < -5 || n > 6) damaged('o desenho', i);
      points[k] = n;
    }
    return { id: 'd' + (i + 1), tool: d.tool, color: d.color, size: d.size, points: points };
  });
}

// ---------- Textos ----------
const TEXT_STYLE_DEFAULTS = {
  fontFamily: "'Caveat', cursive", fontSize: '28px', color: '#f6f3e6', fontWeight: 'normal',
  fontStyle: 'normal', textDecorationLine: 'none', textAlign: 'left', backgroundColor: 'transparent',
  borderRadius: '', padding: ''
};

// Tags permitidas no HTML de um texto (o que o editor da lousa e colagens de texto formatado geram).
const ALLOWED_TAGS = ['div', 'span', 'br', 'p', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'sub', 'sup'];
// Tags cujo CONTEÚDO também é descartado (não vira texto solto).
const DROP_TAGS = ['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript', 'svg', 'math', 'head', 'title', 'link', 'meta', 'textarea', 'select', 'button'];
const ALLOWED_INLINE_STYLES = ['color', 'background-color', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'font-size', 'font-family', 'text-align'];

// Filtra o HTML de um texto: só tags e estilos permitidos, sem atributos (nada de
// onerror=, href=, etc.). Usa DOMParser (documento inerte: nada executa nem carrega).
export function sanitizeTextHtml(html){
  const doc = new DOMParser().parseFromString('<!doctype html><body>' + html, 'text/html');
  const out = document.createElement('div');
  copyClean(doc.body, out, 0);
  return out.innerHTML;
}

function copyClean(from, to, depth){
  from.childNodes.forEach(function(node){
    if(node.nodeType === 3){ // texto
      to.appendChild(document.createTextNode(node.nodeValue));
      return;
    }
    if(node.nodeType !== 1) return; // comentários etc.
    const tag = node.tagName.toLowerCase();
    if(DROP_TAGS.indexOf(tag) !== -1) return;
    if(ALLOWED_TAGS.indexOf(tag) !== -1 && depth < 50){
      const el = document.createElement(tag);
      ALLOWED_INLINE_STYLES.forEach(function(prop){
        const v = node.style && node.style.getPropertyValue(prop);
        if(v && cssValue(v, '') === v) el.style.setProperty(prop, v);
      });
      to.appendChild(el);
      copyClean(node, el, depth + 1);
    } else {
      copyClean(node, to, depth + 1); // tag desconhecida: mantém só o conteúdo
    }
  });
}

function readTexts(list){
  if(!Array.isArray(list)) damaged('a lista de textos');
  return list.map(function(t, i){
    if(!isObj(t)) damaged('o texto', i);
    if(!isNum(t.left) || !isNum(t.top)) damaged('o texto', i);
    const width = t.width === null || t.width === undefined ? null : t.width;
    const height = t.height === null || t.height === undefined ? null : t.height;
    if(width !== null && (!isNum(width) || width <= 0 || width > 20000)) damaged('o texto', i);
    if(height !== null && (!isNum(height) || height <= 0 || height > 20000)) damaged('o texto', i);
    if(typeof t.html !== 'string' || t.html.length > 2000000) damaged('o texto', i);
    const st = isObj(t.style) ? t.style : {};
    const style = {};
    Object.keys(TEXT_STYLE_DEFAULTS).forEach(function(key){
      style[key] = cssValue(st[key], TEXT_STYLE_DEFAULTS[key]);
    });
    if(ALIGNMENTS.indexOf(style.textAlign) === -1) style.textAlign = 'left';
    return {
      id: 'tb' + (i + 1),
      left: clamp(t.left, -50, 150),
      top: clamp(t.top, -50, 150),
      width: width,
      height: height,
      // Textos ficam sempre numa faixa de empilhamento acima das imagens (ver box.js)
      zIndex: isNum(t.zIndex) ? clamp(Math.round(t.zIndex), 10000, 2000000000) : 10000,
      html: sanitizeTextHtml(t.html),
      style: style
    };
  });
}

// ---------- Imagens ----------
function readImages(list){
  if(!Array.isArray(list)) damaged('a lista de imagens');
  return list.map(function(im, i){
    if(!isObj(im)) damaged('a imagem', i);
    if(typeof im.src !== 'string' || !IMAGE_DATA_URL.test(im.src)) damaged('a imagem', i);
    if(!isNum(im.left) || !isNum(im.top)) damaged('a imagem', i);
    if(!isNum(im.width) || !isNum(im.height) || im.width <= 0 || im.height <= 0 || im.width > 20000 || im.height > 20000) damaged('a imagem', i);
    return {
      id: 'ib' + (i + 1),
      src: im.src,
      left: clamp(im.left, -50, 150),
      top: clamp(im.top, -50, 150),
      width: im.width,
      height: im.height,
      // Imagens ficam sempre na faixa 1..900, abaixo dos textos (ver box.js)
      zIndex: isNum(im.zIndex) ? clamp(Math.round(im.zIndex), 1, 900) : 1
    };
  });
}

// ---------- Entrada principal ----------
// Valida o conteúdo de um arquivo .lousa e devolve um estado novo e limpo.
export function parseProject(text){
  let data;
  try{ data = JSON.parse(text); }catch(e){ fail(NOT_A_PROJECT); }
  if(!isObj(data)) fail(NOT_A_PROJECT);
  if('format' in data && data.format !== FILE_FORMAT) fail(NOT_A_PROJECT);

  if(!('version' in data)) fail('O arquivo não informa a versão do projeto, então não é possível abri-lo com segurança.');
  if(!Number.isInteger(data.version) || data.version < 1) fail('A versão informada no arquivo é inválida.');
  if(data.version > STATE_VERSION){
    fail('Este projeto foi salvo por uma versão mais nova da Lousa Digital (formato ' + data.version + '). Atualize o aplicativo para abri-lo.');
  }
  data = migrate(data);

  const head = readTitle(data);
  return {
    version: STATE_VERSION,
    title: head.title,
    titleStyle: head.titleStyle,
    background: readBackground(data.background),
    drawings: readDrawings(data.drawings),
    texts: readTexts(data.texts),
    images: readImages(data.images)
  };
}

// Confere que as imagens do projeto (fundo e imagens coladas) realmente
// carregam — pega base64 truncado/corrompido ANTES de mexer na lousa atual.
export async function verifyImages(state){
  const sources = [];
  if(state.background.custom.src) sources.push(state.background.custom.src);
  state.images.forEach(function(im){ sources.push(im.src); });
  const unique = Array.from(new Set(sources));
  await Promise.all(unique.map(function(src){
    return new Promise(function(resolve, reject){
      const img = new Image();
      img.onload = resolve;
      img.onerror = function(){ reject(new ProjectFormatError('O projeto está danificado: uma das imagens não pôde ser carregada.')); };
      img.src = src;
    });
  }));
}
