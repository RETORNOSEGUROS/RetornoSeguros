/**************************************************************
 * visita-cliente.js — Página pública para cliente preencher
 * Modernizado - mantém toda lógica original
 **************************************************************/
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

/* ---------- QueryString (tolerante) ---------- */
const qp = new URLSearchParams(location.search);
const getQP = (...keys) => {
  for (const k of keys) {
    const v = qp.get(k) || qp.get(k.toLowerCase()) || qp.get(k.toUpperCase());
    if (v) return decodeURIComponent(v);
  }
  return "";
};

const empresaId = getQP("empresaId", "empresa", "idEmpresa", "empresal");
const empresaNome = getQP("empresaNome", "empresa_nome", "nomeEmpresa");
const rmNomeURL = getQP("rmNome", "rm", "rm_nome");

document.getElementById("empresaNome").textContent = empresaNome || "(Empresa)";
document.getElementById("empresaInfo").textContent = empresaNome 
  ? `Preencha as informações dos seguros de ${empresaNome}` 
  : "Preencha as informações dos seguros da sua empresa";

/* ---------- Helpers ---------- */
function maskDDMMYYYY(value) {
  let v = (value || "").replace(/\D/g, "").slice(0, 8);
  if (v.length >= 5) v = v.slice(0, 2) + "/" + v.slice(2, 4) + "/" + v.slice(4);
  else if (v.length >= 3) v = v.slice(0, 2) + "/" + v.slice(2);
  return v;
}

function validaDDMMYYYY(v) {
  if (!v) return false;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if (!m) return false;
  const d = +m[1], mo = +m[2], y = +m[3];
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && (dt.getMonth() + 1) === mo && dt.getDate() === d;
}

function maskMoedaBR(v) {
  v = (v || "").toString().replace(/\D/g, "");
  if (!v) return "R$ 0,00";
  v = (parseInt(v, 10) / 100).toFixed(2);
  let [i, d] = v.split(".");
  i = i.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return "R$ " + i + "," + d;
}

function parseMoedaBRToNumber(str) {
  if (!str) return 0;
  return parseFloat(str.replace(/[R$\s\.]/g, "").replace(",", ".")) || 0;
}

/* ---------- Coleções Firestore ---------- */
const COLEC_RAMO = "ramos-seguro";
const COLEC_SEG = "seguradoras";

/* ---------- Ícones dos Ramos ---------- */
const RAMO_ICONS = {
  "saude": "🏥",
  "dental": "🦷",
  "vida": "❤️",
  "vida-global": "🌍",
  "patrimonial": "🏢",
  "frota": "🚗",
  "equipamentos": "⚙️",
  "garantia": "📜",
  "rc": "⚖️",
  "cyber": "💻",
  "transporte": "🚚",
  "credito": "💳",
  "default": "📋"
};

function getIcone(id) {
  const idLower = (id || "").toLowerCase();
  for (const [key, icon] of Object.entries(RAMO_ICONS)) {
    if (idLower.includes(key)) return icon;
  }
  return RAMO_ICONS.default;
}

/* ---------- Carregadores Firestore ---------- */
async function carregarRamos() {
  try {
    let snap;
    try {
      snap = await db.collection(COLEC_RAMO).orderBy("ordem").get();
    } catch {
      snap = await db.collection(COLEC_RAMO).get();
    }
    const r = [];
    snap.forEach(doc => {
      const d = doc.data() || {};
      const nome = d.nomeExibicao || d.nome || doc.id;
      if (nome) r.push({ id: doc.id, nome });
    });
    return r;
  } catch (e) {
    console.error("[ramos] erro ao ler Firestore:", e);
    throw e;
  }
}

async function carregarSeguradoras() {
  try {
    const snap = await db.collection(COLEC_SEG).get();
    const arr = [];
    snap.forEach(doc => {
      const n = (doc.data()?.nome || "").toString().trim();
      if (n) arr.push(n);
    });
    return arr.sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
  } catch (e) {
    console.error("[seguradoras] erro ao ler Firestore:", e);
    return null;
  }
}

/* ---------- UI ---------- */
function aviso(container, msg) {
  container.innerHTML = `
    <div class="warning-box">
      ${msg}
    </div>
  `;
}

async function gerarCamposRamos() {
  const container = document.getElementById("ramos-container");
  container.innerHTML = `
    <div class="loading-ramos">
      <div class="spinner-sm"></div>
      <span>Carregando ramos de seguro...</span>
    </div>
  `;

  let ramos;
  try {
    ramos = await carregarRamos();
  } catch (e) {
    aviso(container, `
      <strong>Não foi possível carregar os ramos.</strong><br>
      Verifique se <strong>Authentication → Anonymous</strong> está habilitado e se as
      <strong>Rules</strong> permitem <code>read</code> em <code>${COLEC_RAMO}</code> para anônimo.
    `);
    return;
  }

  if (!ramos || ramos.length === 0) {
    aviso(container, `
      <strong>Nenhum ramo encontrado.</strong><br>
      Se a coleção <code>${COLEC_RAMO}</code> existe, confirme as <strong>Rules</strong> de leitura para anônimo.
    `);
    return;
  }

  const seguradoras = await carregarSeguradoras();

  container.innerHTML = "";
  
  ramos.forEach(r => {
    const icon = getIcone(r.id);
    
    const box = document.createElement("div");
    box.className = "ramo-box";
    box.id = `box-${r.id}`;

    // Seguradora: select ou input
    const campoSeguradora = (seguradoras && seguradoras.length)
      ? `<select id="${r.id}-seguradora">
           <option value="">Selecione</option>
           ${seguradoras.map(s => `<option value="${s}">${s}</option>`).join("")}
         </select>`
      : `<input type="text" id="${r.id}-seguradora" placeholder="Ex.: Porto, Bradesco..." />`;

    box.innerHTML = `
      <div class="head" onclick="toggleRamoBox('${r.id}')">
        <input type="checkbox" class="ramo" value="${r.id}" id="chk-${r.id}" onclick="event.stopPropagation(); toggleRamoBox('${r.id}')">
        <label for="chk-${r.id}">${icon} ${r.nome}</label>
        <div class="ramo-toggle"></div>
      </div>
      <div class="subcampos" id="campos-${r.id}">
        <div class="subcampos-grid">
          <div>
            <label>Vencimento (dd/mm/aaaa)</label>
            <input type="text" id="${r.id}-vencimento" inputmode="numeric" placeholder="dd/mm/aaaa" maxlength="10">
          </div>
          <div>
            <label>Prêmio Anual (R$)</label>
            <input type="text" id="${r.id}-premio" placeholder="R$ 0,00">
          </div>
          <div>
            <label>Seguradora</label>
            ${campoSeguradora}
          </div>
          <div class="full">
            <label>Observações</label>
            <textarea id="${r.id}-observacoes" placeholder="Comentários ou detalhes adicionais..."></textarea>
          </div>
        </div>
      </div>
    `;

    container.appendChild(box);

    // Event listeners
    const vencInput = document.getElementById(`${r.id}-vencimento`);
    vencInput?.addEventListener("input", e => {
      e.target.value = maskDDMMYYYY(e.target.value);
    });

    const premioInput = document.getElementById(`${r.id}-premio`);
    premioInput?.addEventListener("input", e => {
      e.target.value = maskMoedaBR(e.target.value);
    });
  });

  // Aviso se não carregou seguradoras
  if (seguradoras === null) {
    const note = document.createElement("div");
    note.className = "warning-box";
    note.style.marginTop = "12px";
    note.innerHTML = `
      <strong>Aviso:</strong> Não foi possível carregar a lista de seguradoras.
      Você pode digitar o nome manualmente.
    `;
    container.appendChild(note);
  }
}

// Toggle do ramo (visual + checkbox)
function toggleRamoBox(ramoId) {
  const box = document.getElementById(`box-${ramoId}`);
  const chk = document.getElementById(`chk-${ramoId}`);
  
  if (!box || !chk) return;
  
  chk.checked = !chk.checked;
  box.classList.toggle('active', chk.checked);
}
window.toggleRamoBox = toggleRamoBox;

/* ---------- Enviar ---------- */
async function enviar() {
  if (!empresaId) {
    alert("Link inválido (sem empresa).");
    return;
  }

  const user = auth.currentUser;
  const nfStr = (document.getElementById("numFuncionarios")?.value || "").trim();
  const numeroFuncionarios = nfStr === "" ? null : Math.max(0, parseInt(nfStr, 10) || 0);

  const visita = {
    source: "cliente_link",
    empresaId,
    empresaNome,
    tipoVisita: "Cliente",
    rmNome: rmNomeURL || "",
    rmUid: null,
    agenciaId: "",
    usuarioId: user?.uid || null,
    criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    numeroFuncionarios,
    ramos: {}
  };

  let algum = false;
  let erro = null;
  
  document.querySelectorAll(".ramo").forEach(chk => {
    if (!chk.checked) return;
    algum = true;
    
    const id = chk.value;
    const venc = (document.getElementById(`${id}-vencimento`)?.value || "").trim();
    const premioStr = (document.getElementById(`${id}-premio`)?.value || "");
    const seg = (document.getElementById(`${id}-seguradora`)?.value || "");
    const obs = (document.getElementById(`${id}-observacoes`)?.value || "");
    
    if (venc && !validaDDMMYYYY(venc)) {
      erro = `Vencimento inválido em "${id}". Use o formato dd/mm/aaaa.`;
    }
    
    visita.ramos[id] = {
      vencimento: venc,
      premio: parseMoedaBRToNumber(premioStr),
      seguradora: seg,
      observacoes: obs
    };
  });

  if (erro) {
    alert(erro);
    return;
  }
  
  if (!algum) {
    alert("Por favor, marque pelo menos um ramo de seguro.");
    return;
  }

  try {
    await db.collection("visitas").add(visita);
    
    // Mostrar mensagem de sucesso
    document.getElementById("ok").classList.add("show");
    
    // Desabilitar botão
    const btn = document.querySelector(".btn-primary");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = "✅ Enviado!";
      btn.style.background = "#10b981";
    }
    
    // Scroll para o topo
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
  } catch (e) {
    console.error("[visitas.add]", e);
    alert("Erro ao enviar. Por favor, tente novamente.");
  }
}
window.enviar = enviar;

/* ---------- Bootstrap: após login anônimo ---------- */
document.addEventListener("DOMContentLoaded", () => {
  auth.signInAnonymously()
    .then(() => {
      auth.onAuthStateChanged(user => {
        if (!user) return;
        gerarCamposRamos().catch(e => console.error("Falha ao montar ramos:", e));
      });
    })
    .catch(err => {
      console.error("[auth anon] erro:", err);
      gerarCamposRamos().catch(e => console.error("Falha ao montar ramos:", e));
    });
});
