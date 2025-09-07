// funcionarios.js — v8 compatível (menu removido nesta página, % mapeadas + PDF)
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

let CTX = { uid:null, perfil:null, agenciaId:null, nome:null };

// lista atual e última lista renderizada (para PDF respeitar o filtro)
let LISTA = [];
let LISTA_RENDERIZADA = [];

const normalizarPerfil = (p)=>String(p||"")
  .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLowerCase()
  .replace(/[-_]+/g," ")
  .trim();

const toDate  = (x)=> x?.toDate ? x.toDate() : (x ? new Date(x) : null);
const fmtDataHora = (d)=> d ? d.toLocaleDateString("pt-BR")+" "+d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}) : "-";

// ====== Auth/contexto
auth.onAuthStateChanged(async (user)=>{
  if(!user) return location.href="login.html";
  CTX.uid = user.uid;

  // carrega perfil
  const prof = await db.collection("usuarios_banco").doc(user.uid).get();
  if(!prof.exists){ document.getElementById("perfilUsuario").textContent="Usuário não encontrado"; return; }

  const d = prof.data();
  CTX.perfil    = normalizarPerfil(d.perfil || "");
  CTX.agenciaId = d.agenciaId || d.agenciaid || null;
  CTX.nome      = d.nome || user.email;

  document.getElementById("perfilUsuario").textContent = `${CTX.nome} (${d.perfil||"sem perfil"})`;

  wireUi();
  carregarEmpresas();
});

// ====== UI handlers
function wireUi(){
  document.getElementById("atualizarLista")?.addEventListener("click", carregarEmpresas);
  document.getElementById("busca")?.addEventListener("input", filtrarTabela);
  document.getElementById("exportPdf")?.addEventListener("click", exportarPDF);

  const modal = document.getElementById("modalEditar");
  const fechar= document.getElementById("fecharEditar");
  fechar?.addEventListener("click", ()=> modal.style.display="none");
  modal?.addEventListener("click", (e)=>{ if(e.target===modal) modal.style.display="none"; });
  document.getElementById("salvarEditar")?.addEventListener("click", salvarEdicao);
}

// ====== Data cache
const cacheUsuarios = new Map(); // uid -> nome
const cacheAgencias = new Map(); // agenciaId/agenciaid -> nome

async function getUsuarioNome(uid, fallback){
  if(fallback) return fallback;
  if(!uid) return "-";
  if(cacheUsuarios.has(uid)) return cacheUsuarios.get(uid);
  const snap = await db.collection("usuarios_banco").doc(uid).get();
  const nome = snap.exists ? (snap.data().nome || snap.data().apelido || snap.data().email || "-") : "-";
  cacheUsuarios.set(uid, nome); return nome;
}
async function getAgenciaNome(id, fallback){
  if(fallback) return fallback;
  if(!id) return "-";
  if(cacheAgencias.has(id)) return cacheAgencias.get(id);
  let snap = await db.collection("agencias").doc(id).get().catch(()=>null);
  if(!snap || !snap.exists) snap = await db.collection("agencias_banco").doc(id).get().catch(()=>null);
  const nome = (snap && snap.exists) ? (snap.data().nome || snap.data().descricao || "-") : "-";
  cacheAgencias.set(id, nome); return nome;
}

// ====== Carregar e renderizar empresas
async function carregarEmpresas(){
  const status = document.getElementById("statusLista");
  const tbody  = document.getElementById("tbodyEmpresas");
  status.textContent = "Carregando empresas…";
  tbody.innerHTML = "";

  try{
    const col = db.collection("empresas");
    let q = col;

    // escopo por perfil
    if (CTX.perfil === "rm" && CTX.uid) {
      q = q.where("rmUid", "==", CTX.uid);
    } else if ((CTX.perfil === "assistente" || CTX.perfil === "gerente chefe") && CTX.agenciaId){
      q = q.where("agenciaId", "==", CTX.agenciaId);
    }

    let snap = await q.limit(2000).get();
    if (snap.empty && (CTX.perfil==="assistente" || CTX.perfil==="gerente chefe") && CTX.agenciaId){
      snap = await col.where("agenciaid", "==", CTX.agenciaId).limit(2000).get();
    }

    if (snap.empty){
      LISTA = [];
      updateStatus([], 0);
      atualizarBadgePercentual([]);
      tbody.innerHTML = `<tr><td colspan="6" class="muted" style="padding:18px">Nenhuma empresa encontrada para seu perfil/regra.</td></tr>`;
      LISTA_RENDERIZADA = [];
      return;
    }

    const arr = [];
    snap.forEach(doc=>{
      const d = doc.data() || {};
      arr.push({
        id: doc.id,
        nome: d.nome || d.razaoSocial || d.fantasia || "Empresa",
        rmUid: d.rmUid || d.rm || null,
        rmNome: d.rmNome || null,
        agenciaId: d.agenciaId || d.agenciaid || null,
        agenciaNome: d.agenciaNome || null,
        funcionariosQtd: (typeof d.funcionariosQtd === "number") ? d.funcionariosQtd : (d.funcionarios ?? null),
        funcionariosAtualizadoEm: d.funcionariosAtualizadoEm || d.atualizadoFuncionariosEm || null
      });
    });

    // enriquecer nomes
    for (const it of arr){
      it.rmNome = await getUsuarioNome(it.rmUid, it.rmNome);
      it.agenciaNome = await getAgenciaNome(it.agenciaId, it.agenciaNome);
    }

    arr.sort((a,b)=> String(a.nome).localeCompare(String(b.nome), 'pt', {sensitivity:'base'}));
    LISTA = arr;

    renderTabela(LISTA);
    updateStatus(LISTA, LISTA.length);
    atualizarBadgePercentual(LISTA);

  } catch (err) {
    console.error("[funcionarios] erro carregarEmpresas:", err);
    const code = err?.code || "erro-desconhecido";
    const msg  = err?.message || String(err);
    document.getElementById("statusLista").textContent = `Erro ao carregar empresas. (${code}) ${msg}`;
  }
}

function renderTabela(lista){
  const tbody  = document.getElementById("tbodyEmpresas");
  tbody.innerHTML = "";

  LISTA_RENDERIZADA = [...lista];

  if(!lista.length){
    tbody.innerHTML = `<tr><td colspan="6" class="muted" style="padding:18px">Nenhum registro.</td></tr>`;
    return;
  }

  for(const it of lista){
    const dt = toDate(it.funcionariosAtualizadoEm);
    const podeEditar = podeEditarEmpresa(it);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="sticky-left col-empresa"><strong>${escapeHtml(it.nome)}</strong></td>
      <td class="hide-sm">${escapeHtml(it.rmNome || "-")}</td>
      <td class="hide-sm">${escapeHtml(it.agenciaNome || "-")}</td>
      <td class="sticky-right col-func">${it.funcionariosQtd != null ? `<span class="tag">${it.funcionariosQtd.toLocaleString("pt-BR")}</span>` : '<span class="muted">—</span>'}</td>
      <td class="hide-sm">${fmtDataHora(dt)}</td>
      <td class="hide-sm">
        ${podeEditar
          ? `<button class="btn" data-edit="${it.id}">Editar</button>`
          : `<span class="muted">Sem permissão</span>`
        }
      </td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll("[data-edit]").forEach(btn=>{
    btn.addEventListener("click", ()=> abrirEditar(btn.getAttribute("data-edit")));
  });
}

function filtrarTabela(e){
  const termo = (e?.target?.value || document.getElementById("busca").value || "").trim().toLowerCase();

  if(!termo){
    renderTabela(LISTA);
    updateStatus(LISTA, LISTA.length);
    atualizarBadgePercentual(LISTA);
    return;
  }

  const filtrada = LISTA.filter(it=>{
    return String(it.nome).toLowerCase().includes(termo) ||
           String(it.rmNome||"").toLowerCase().includes(termo) ||
           String(it.agenciaNome||"").toLowerCase().includes(termo);
  });

  renderTabela(filtrada);
  updateStatus(filtrada, LISTA.length);
  atualizarBadgePercentual(filtrada, LISTA.length);
}

// ====== Status/contadores + % mapeadas
function updateStatus(listaAtual, totalBaseEmpresas){
  const totalEmpresas = Number.isFinite(totalBaseEmpresas) ? totalBaseEmpresas : LISTA.length;
  const qtdEmpresasFiltro = listaAtual.length;

  const totalFuncionariosFiltro = listaAtual.reduce((acc, it)=>{
    const v = Number(it.funcionariosQtd);
    return acc + (Number.isFinite(v) ? v : 0);
  }, 0);

  const mapeadas = listaAtual.filter(it => it.funcionariosQtd != null).length;
  const perc = totalEmpresas > 0 ? (mapeadas / totalEmpresas * 100) : 0;

  const status = document.getElementById("statusLista");
  status.textContent =
    `${qtdEmpresasFiltro} empresa(s) carregada(s) · Total de funcionários no filtro: ${totalFuncionariosFiltro.toLocaleString("pt-BR")} · ` +
    `Empresas mapeadas: ${mapeadas}/${totalEmpresas} (${perc.toFixed(1)}%)`;
}

function atualizarBadgePercentual(listaAtual, totalBase=LISTA.length){
  const mapeadas = listaAtual.filter(it => it.funcionariosQtd != null).length;
  const total = totalBase || 0;
  const perc = total > 0 ? (mapeadas / total * 100) : 0;
  const el = document.getElementById("percentualMapeadas");
  if(el){
    el.textContent = `Mapeadas: ${mapeadas}/${total} (${perc.toFixed(1)}%)`;
  }
}

// ====== Permissão de edição (UI) — valide nas RULES de verdade
function podeEditarEmpresa(it){
  if(CTX.perfil === "admin") return true;
  if(CTX.perfil === "rm" && it.rmUid === CTX.uid) return true;
  if((CTX.perfil === "assistente" || CTX.perfil === "gerente chefe") && it.agenciaId === CTX.agenciaId) return true;
  return false;
}

// ====== Modal Editar
let alvoAtual = null;

function abrirEditar(empId){
  alvoAtual = LISTA.find(x=>x.id === empId) || null;
  if(!alvoAtual) return;

  document.getElementById("empresaAlvo").textContent =
    `${alvoAtual.nome} • RM: ${alvoAtual.rmNome || "-"} • Agência: ${alvoAtual.agenciaNome || "-"}`;
  document.getElementById("novoNumero").value =
    (alvoAtual.funcionariosQtd != null ? alvoAtual.funcionariosQtd : "");
  document.getElementById("editErro").textContent = "";
  document.getElementById("editInfo").textContent = "";

  document.getElementById("modalEditar").style.display = "block";
}

async function salvarEdicao(){
  const erroEl = document.getElementById("editErro");
  const infoEl = document.getElementById("editInfo");
  erroEl.textContent = ""; infoEl.textContent = "";

  if(!alvoAtual){ erroEl.textContent = "Nenhuma empresa selecionada."; return; }

  const raw = document.getElementById("novoNumero").value.trim();
  if(raw === ""){ erroEl.textContent = "Informe o número de funcionários."; return; }
  const numero = parseInt(raw, 10);
  if(!Number.isFinite(numero) || numero < 0){ erroEl.textContent = "Número inválido."; return; }

  if(!podeEditarEmpresa(alvoAtual)){ erroEl.textContent = "Sem permissão para editar."; return; }

  try{
    await db.collection("empresas").doc(alvoAtual.id).update({
      funcionariosQtd: numero,
      funcionariosAtualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
      funcionariosAtualizadoPor: CTX.uid
    });

    infoEl.textContent = "Atualizado com sucesso!";
    alvoAtual.funcionariosQtd = numero;
    alvoAtual.funcionariosAtualizadoEm = new Date();

    const termoAtual = (document.getElementById("busca").value || "").trim();
    if(termoAtual){
      filtrarTabela();
    }else{
      renderTabela(LISTA);
      updateStatus(LISTA, LISTA.length);
      atualizarBadgePercentual(LISTA);
    }

    setTimeout(()=> document.getElementById("modalEditar").style.display = "none", 800);
  }catch(err){
    console.error(err);
    erroEl.textContent = err?.message || "Erro ao salvar.";
  }
}

// ====== Exportar PDF (layout dedicado para garantir beleza e integridade)
function exportarPDF(){
  try{
    const dados = LISTA_RENDERIZADA.length ? LISTA_RENDERIZADA : LISTA;
    if(!dados.length){
      alert("Nada para exportar ainda. Aguarde o carregamento da lista.");
      return;
    }

    const agora = new Date();
    const total = LISTA.length || dados.length;
    const mapeadas = (LISTA.length ? LISTA : dados).filter(it => it.funcionariosQtd != null).length;
    const perc = total>0 ? (mapeadas/total*100).toFixed(1) : "0.0";
    const totalFuncionariosFiltro = dados.reduce((acc, it)=>{
      const v = Number(it.funcionariosQtd);
      return acc + (Number.isFinite(v) ? v : 0);
    }, 0);

    const wrap = document.getElementById("pdfArea");
    wrap.innerHTML = ""; // limpa

    const box = document.createElement("div");
    box.className = "pdf-card";
    box.innerHTML = `
      <h1>Funcionários por Empresa — Retorno Seguros</h1>
      <div class="sub">
        Emitido em ${agora.toLocaleDateString("pt-BR")} ${agora.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})} ·
        Usuário: ${escapeHtml(CTX.nome||"-")} ·
        Empresas mapeadas: ${mapeadas}/${total} (${perc}%)
      </div>

      <table>
        <thead>
          <tr>
            <th style="width:28%">Empresa</th>
            <th style="width:18%">RM</th>
            <th style="width:18%">Agência</th>
            <th style="width:14%; text-align:right">Funcionários</th>
            <th style="width:22%">Atualizado em</th>
          </tr>
        </thead>
        <tbody>
          ${dados.map(it=>{
            const dt = toDate(it.funcionariosAtualizadoEm);
            return `
              <tr>
                <td>${escapeHtml(it.nome)}</td>
                <td>${escapeHtml(it.rmNome || "-")}</td>
                <td>${escapeHtml(it.agenciaNome || "-")}</td>
                <td style="text-align:right">${it.funcionariosQtd != null ? it.funcionariosQtd.toLocaleString("pt-BR") : "—"}</td>
                <td>${fmtDataHora(dt)}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3">Total (filtro atual)</td>
            <td style="text-align:right">${totalFuncionariosFiltro.toLocaleString("pt-BR")}</td>
            <td>Empresas no filtro: ${dados.length}</td>
          </tr>
        </tfoot>
      </table>
    `;
    wrap.appendChild(box);

    const opt = {
      margin:       [8, 8, 10, 8],
      filename:     `funcionarios-empresas-${agora.toISOString().slice(0,10)}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, letterRendering: true, dpi: 192 },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' }
    };

    html2pdf().set(opt).from(box).save();
  }catch(e){
    console.error("Falha ao exportar PDF:", e);
    alert("Não foi possível gerar o PDF. Verifique o console para detalhes.");
  }
}

// ====== Helpers
function escapeHtml(s){
  return String(s==null?"":s)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}
