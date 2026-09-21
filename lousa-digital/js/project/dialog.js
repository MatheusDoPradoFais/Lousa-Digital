// project/dialog.js
// Caixa de diálogo simples (mensagem, confirmação com vários botões e/ou campo
// de texto), no lugar de alert()/confirm()/prompt() — que não permitem o
// "Salvar / Não salvar / Cancelar" pedido nas confirmações. Usa o elemento
// nativo <dialog>, sem bibliotecas. O visual está em css/style.css (.lousa-dialog).
//
// showDialog({ title, message, input, buttons }) → Promise<{ button, value }>
//   - buttons: [{ label, value, primary?, danger? }] (da esquerda para a direita)
//   - input:   { value, placeholder } (opcional; `value` do resultado = texto digitado)
//   - Esc ou fechar sem escolher resolve com button === 'cancel'.

export function isDialogOpen(){
  return !!document.querySelector('dialog.lousa-dialog[open]');
}

export function showDialog(options){
  return new Promise(function(resolve){
    const dlg = document.createElement('dialog');
    dlg.className = 'lousa-dialog';
    dlg.setAttribute('aria-labelledby', 'lousaDialogTitle');

    const h = document.createElement('h2');
    h.id = 'lousaDialogTitle';
    h.textContent = options.title || '';
    dlg.appendChild(h);

    if(options.message){
      const p = document.createElement('p');
      p.textContent = options.message; // textContent: nada do arquivo do usuário vira HTML
      dlg.appendChild(p);
    }

    let field = null;
    if(options.input){
      field = document.createElement('input');
      field.type = 'text';
      field.className = 'lousa-dialog-input';
      field.value = options.input.value || '';
      field.placeholder = options.input.placeholder || '';
      field.maxLength = 120;
      field.spellcheck = false;
      dlg.appendChild(field);
    }

    const row = document.createElement('div');
    row.className = 'lousa-dialog-buttons';
    let primaryBtn = null;
    (options.buttons || [{ label: 'OK', value: 'ok', primary: true }]).forEach(function(b){
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dlg-btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : '');
      btn.textContent = b.label;
      btn.dataset.value = b.value;
      btn.addEventListener('click', function(){ finish(b.value); });
      if(b.primary) primaryBtn = btn;
      row.appendChild(btn);
    });
    dlg.appendChild(row);

    let finished = false;
    function finish(value){
      if(finished) return;
      finished = true;
      const text = field ? field.value : '';
      dlg.close();
      dlg.remove();
      resolve({ button: value, value: text });
    }

    // Esc (evento "cancel" do <dialog>) = cancelar
    dlg.addEventListener('cancel', function(e){ e.preventDefault(); finish('cancel'); });
    if(field){
      field.addEventListener('keydown', function(e){
        if(e.key === 'Enter'){ e.preventDefault(); if(primaryBtn) primaryBtn.click(); }
      });
    }

    document.body.appendChild(dlg);
    dlg.showModal();
    if(field){ field.focus(); field.select(); }
    else if(primaryBtn){ primaryBtn.focus(); }
  });
}

export function showMessage(title, message){
  return showDialog({ title: title, message: message, buttons: [{ label: 'OK', value: 'ok', primary: true }] });
}
