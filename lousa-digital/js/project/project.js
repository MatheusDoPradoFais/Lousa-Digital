// project/project.js
// Gerenciamento de projetos: Novo, Abrir, Salvar e Salvar como, mais o
// controle de "alterações não salvas" (isDirty).
//
// O conteúdo do projeto é o estado central (core/state.js); o arquivo é
// gerado por project/save.js e lido/validado por project/load.js; a lousa é
// reconstruída por restoreState() (core/restore.js). Este módulo só orquestra
// e guarda a "sessão" do projeto: qual arquivo está aberto e o que já foi salvo.
//
// Alterações não salvas: o histórico (history.js) guarda snapshots do estado.
// Ao salvar, marcamos o snapshot atual como "salvo"; o projeto está sujo
// (isDirty) quando o snapshot atual é outro — ou seja, desfazer até o ponto
// salvo volta a mostrar "Salvo", e refazer/novas ações mostram "não salvo".

import { getStateSnapshot, createEmptyState, getTitle } from '../core/state.js';
import { restoreState } from '../core/restore.js';
import { getCurrentEntry, hasPendingEdit, resetHistory, registerHistoryListener } from '../history.js';
import { commitPendingTextEdit } from '../text.js';
import {
  serializeProject, makeFileName, suggestedFileName, hasFileSystemAccess,
  pickSaveHandle, writeToHandle, downloadProject
} from './save.js';
import { pickProjectFile, readProjectFile, parseProject, verifyImages, ProjectFormatError } from './load.js';
import { showDialog, showMessage } from './dialog.js';

// ---------- Sessão do projeto ----------
let fileName = null;   // nome do arquivo .lousa associado (null = nunca salvo/aberto)
let fileHandle = null; // handle do File System Access API, quando disponível
let savedEntry = null; // entrada do histórico que corresponde ao que está salvo
let busy = false;      // evita ações concorrentes (ex.: duplo clique em Salvar)

const listeners = [];
export function onProjectChange(fn){ listeners.push(fn); }

// true = existem alterações que ainda não foram salvas.
export function isDirty(){
  return hasPendingEdit() || getCurrentEntry() !== savedEntry;
}

export function getProjectInfo(){
  return { dirty: isDirty(), fileName: fileName };
}

function notify(){
  const info = getProjectInfo();
  listeners.forEach(function(fn){ fn(info); });
}

// Marca a situação atual como salva.
function markSaved(entry){
  savedEntry = entry;
  notify();
}

// O histórico avisa a cada mudança (nova ação, undo, redo) → atualiza o indicador.
registerHistoryListener(notify);

// Chamado uma vez no início (depois de resetHistory): a lousa inicial conta como salva.
export function initProject(){
  fileName = null;
  fileHandle = null;
  markSaved(getCurrentEntry());
}

// ---------- Utilitários de interface ----------
async function runExclusive(fn){
  if(busy) return false;
  busy = true;
  try{ return await fn(); }
  finally{ busy = false; }
}

// Se houver alterações não salvas, pergunta o que fazer.
// Retorna true se pode continuar (salvou ou o usuário escolheu não salvar), false se cancelou.
async function confirmDiscardChanges(detail){
  if(!isDirty()) return true;
  const res = await showDialog({
    title: 'Alterações não salvas',
    message: 'A lousa “' + getTitle() + '” tem alterações que ainda não foram salvas. ' + detail + ' Deseja salvar antes?',
    buttons: [
      { label: 'Cancelar', value: 'cancel' },
      { label: 'Não salvar', value: 'discard', danger: true },
      { label: 'Salvar', value: 'save', primary: true }
    ]
  });
  if(res.button === 'discard') return true;
  if(res.button === 'save') return await saveInternal(false);
  return false;
}

async function askFileName(suggested){
  const res = await showDialog({
    title: 'Salvar projeto',
    message: 'Dê um nome ao projeto. O arquivo será baixado com a extensão .lousa.',
    input: { value: suggested.replace(/\.lousa$/i, ''), placeholder: 'Nome do projeto' },
    buttons: [
      { label: 'Cancelar', value: 'cancel' },
      { label: 'Salvar', value: 'save', primary: true }
    ]
  });
  if(res.button !== 'save') return null;
  return makeFileName(res.value);
}

// ---------- Salvar / Salvar como ----------
// Retorna true se o arquivo foi gravado; false se o usuário cancelou ou deu erro.
async function saveInternal(saveAs){
  commitPendingTextEdit(); // texto em digitação entra no estado antes de salvar
  const state = getStateSnapshot();
  const marker = getCurrentEntry();
  const text = serializeProject(state);
  const suggested = fileName || suggestedFileName(state.title);

  try{
    let savedWithPicker = false;
    if(hasFileSystemAccess()){
      try{
        let handle = !saveAs ? fileHandle : null;
        if(!handle){
          handle = await pickSaveHandle(suggested);
          if(!handle) return false; // usuário cancelou a janela "Salvar como"
        }
        await writeToHandle(handle, text);
        fileHandle = handle;
        fileName = handle.name;
        savedWithPicker = true;
      }catch(err){
        // Se a API existe mas foi bloqueada (ex.: página dentro de um iframe), cai no download.
        if(!err || (err.name !== 'SecurityError' && err.name !== 'TypeError' && err.name !== 'NotSupportedError')) throw err;
      }
    }
    if(!savedWithPicker){
      let name = !saveAs ? fileName : null;
      if(!name){
        name = await askFileName(suggested);
        if(!name) return false;
      }
      downloadProject(text, name);
      fileName = name;
      fileHandle = null;
    }
    markSaved(marker);
    return true;
  }catch(err){
    await showMessage('Não foi possível salvar', 'Ocorreu um erro ao gravar o arquivo do projeto. Tente novamente ou use “Salvar como”.');
    return false;
  }
}

export function saveProject(){ return runExclusive(function(){ return saveInternal(false); }); }
export function saveProjectAs(){ return runExclusive(function(){ return saveInternal(true); }); }

// ---------- Novo ----------
export function newProject(){
  return runExclusive(async function(){
    commitPendingTextEdit();
    if(!await confirmDiscardChanges('Criar um novo projeto vai limpar a lousa atual.')) return false;
    restoreState(createEmptyState()); // limpa tudo e recria o estado inicial (título padrão, fundo padrão)
    resetHistory();                   // sem Desfazer/Refazer herdados do projeto anterior
    fileName = null;
    fileHandle = null;
    markSaved(getCurrentEntry());
    return true;
  });
}

// ---------- Abrir ----------
export function openProject(){
  return runExclusive(async function(){
    commitPendingTextEdit();

    // 1) Escolher, ler e validar o arquivo ANTES de mexer em qualquer coisa.
    let picked;
    try{
      picked = await pickProjectFile();
    }catch(err){
      await showMessage('Não foi possível abrir', 'Não foi possível acessar o arquivo escolhido.');
      return false;
    }
    if(!picked) return false; // cancelou

    let loaded;
    try{
      loaded = parseProject(await readProjectFile(picked.file));
      await verifyImages(loaded);
    }catch(err){
      const msg = err instanceof ProjectFormatError ? err.userMessage : 'Não foi possível ler o arquivo escolhido.';
      await showMessage('Não foi possível abrir “' + picked.file.name + '”', msg + ' A lousa atual não foi alterada.');
      return false;
    }

    // 2) Só agora, com o arquivo aprovado, pergunta sobre as alterações não salvas.
    if(!await confirmDiscardChanges('Abrir “' + picked.file.name + '” vai substituir a lousa atual.')) return false;

    // 3) Reconstruir a lousa. Se algo falhar no meio, volta ao que estava antes.
    const backup = getStateSnapshot();
    try{
      restoreState(loaded);
    }catch(err){
      restoreState(backup);
      await showMessage('Não foi possível abrir “' + picked.file.name + '”', 'Ocorreu um erro ao montar a lousa. A lousa atual foi mantida.');
      return false;
    }
    resetHistory(); // Desfazer/Refazer recomeçam a partir do projeto aberto
    fileName = picked.file.name;
    fileHandle = picked.handle;
    markSaved(getCurrentEntry());
    return true;
  });
}
