// ui.js

const MENU_EMPRESA = [
  { id:'overview',  label:'Visão Geral',        icon:'📊' },
  { id:'seguros',   label:'Seguros Ativos',     icon:'🧾' },
  { id:'colab',     label:'Colaboradores',      icon:'👥' },
  { id:'indic',     label:'Indicações',         icon:'🎁' },
  { id:'sinistros', label:'Sinistros',          icon:'🛟' },
  { id:'docs',      label:'Documentos',         icon:'📁' },
  { id:'config',    label:'Configurações',      icon:'⚙️' },
];

function renderMenu(containerId, onSelect){
  const el = document.getElementById(containerId);
  el.innerHTML = '';
  MENU_EMPRESA.forEach(item=>{
    const a = document.createElement('button');
    a.className = 'w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 flex items-center gap-2';
    a.innerHTML = `<span>${item.icon}</span><span>${item.label}</span>`;
    a.onclick = () => onSelect(item.id);
    el.appendChild(a);
  });
}

function renderUserBox(elId, user, roleTxt){
  const el = document.getElementById(elId);
  el.textContent = `${user.email} • ${roleTxt}`;
}

function cardMetric(title, value, sub){
  return `
    <div class="bg-white rounded-2xl shadow p-4">
      <div class="text-sm text-slate-500">${title}</div>
      <div class="text-2xl font-semibold text-slate-800 mt-1">${value}</div>
      <div class="text-xs text-slate-500 mt-1">${sub||''}</div>
    </div>
  `;
}

function tableSegurosHeader(){
  return `
    <div class="bg-white rounded-2xl shadow">
      <div class="px-4 py-3 border-b flex justify-between items-center">
        <h3 class="font-medium text-slate-800">Seguros Ativos</h3>
        <button id="btnNovoSeguro" class="px-3 py-1.5 text-sm rounded-lg bg-indigo-600 text-white">Adicionar</button>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-slate-50">
            <tr>
              <th class="text-left px-4 py-2">Ramo</th>
              <th class="text-left px-4 py-2">Apólice</th>
              <th class="text-left px-4 py-2">Seguradora</th>
              <th class="text-left px-4 py-2">Vigência</th>
              <th class="text-left px-4 py-2">Prêmio</th>
              <th class="text-left px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody id="tbodySeguros"></tbody>
        </table>
      </div>
    </div>
  `;
}

function rowSeguro(s){
  const vig = `${s.inicioVigencia||'-'} → ${s.fimVigencia||'-'}`;
  return `
    <tr class="border-t">
      <td class="px-4 py-2">${s.ramo||'-'}</td>
      <td class="px-4 py-2">${s.apolice||'-'}</td>
      <td class="px-4 py-2">${s.seguradora||'-'}</td>
      <td class="px-4 py-2">${vig}</td>
      <td class="px-4 py-2">R$ ${Number(s.premio||0).toLocaleString('pt-BR')}</td>
      <td class="px-4 py-2">${s.status||'-'}</td>
    </tr>
  `;
}
