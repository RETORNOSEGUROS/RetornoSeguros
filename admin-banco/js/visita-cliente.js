/**************************************************************
 * visita-cliente.js
 * Página pública para o cliente preencher os ramos/seguradoras
 * Salva em /visitas com source: "cliente_link"
 *
 * Requisitos:
 *  - Firebase v8 (app, auth, firestore) carregados no HTML
 *  - Auth "Anonymous" habilitada no Firebase Console
 *  - Regras Firestore com permissão de create p/ anônimo quando
 *    request.resource.data.source == "cliente_link"
 **************************************************************/

/* ============================================================
   0) BOOT DO FIREBASE
   ============================================================ */
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db   = firebase.firestore();
const auth = firebase.auth();

/* ============================================================
   1) PARÂMETROS DO LINK (tolerantes)
      Aceita empresaId / empresa / idEmpresa / empresal
      Aceita empresaNome / empresa_nome / nomeEmpresa
      Aceita rmNome / rm / rm_nome
   ============================================================ */

/** Lê parâmetros tolerando grafias e caixa */
const qp = new URLSearchParams(location.search);
function getQP(...keys) {
  for (const k of keys) {
    const val =
      qp.get(k) ||
      qp.get(k.toLowerCase()) ||
      qp.get(k.toUpperCase());
    if (val) return decodeURIComponent(val);
  }
  return "";
}

// IDs e nomes vindos do link
const empresaId   = getQP("empresaId", "empresa", "idEmpresa", "empresal");
const empresaNome = getQP("empresaNome", "empresa_nome", "nomeEmpresa");
const rmNomeURL   = getQP("rmNome", "rm", "rm_nome");

// Preenche cabeçalho imediatamente (UX)
const $empresaNome = document.getElementById("empresaNome");
const $empresaInfo = document.getElementById("empresaInfo");
if ($empresaNome) $empresaNome.textContent = empresaNome || "(Empresa)";
if ($empresaInfo) $empresaInfo.textContent = empresaNome ? `Empresa: ${empresaNome}` : "";

/* ============================================================
   2) LOGIN ANÔNIMO
   - Cliente entra como anônimo
   - Regras: permitir read em ramos/seguradoras (ou fallback)
             permitir create em /visitas se source == "cliente_link"
   ============================================================ */
auth.signInAnonymously().catch((err) => {
  // Erro de login anônimo geralmente indica que o método
  // não está habilitado no Firebase Auth.
  console.error("[Auth] Falha no anônimo:", err);
});

/* ============================================================
   3) HELPERS (máscaras e validações)
   ============================================================ */

/** dd/mm/aaaa em tempo real (aceita apenas números) */
function maskDDMMYYYY(value) {
  let v = (value || "").replace(/\D/g, "").slice(0, 8);
  if (v.length >= 5) {
    v = v.slice(0, 2) + "/" + v.slice(2, 4) + "/" + v.slice(4);
  } else if (v.length >= 3) {
    v = v.slice(0, 2) + "/" + v.slice(2);
  }
  return v;
}

/** Valida dd/mm/aaaa (datas reais) */
function validaDDMMYYYY(v) {
  if (!v) return false;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if (!m) return false;

  const d  = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const y  = parseInt(m[3], 10);

  if (d < 1 || d > 31 || mo < 1 || mo > 12 || y < 1900) return false;

  const dt = new Date(y, mo - 1, d);
  return (
    dt.getFullYear() === y &&
    dt.getMonth() === (mo - 1) &&
    dt.getDate() === d
  );
}

/** Moeda BR em tempo real (R$ 0,00) */
function maskMoedaBR(v) {
  v = (v || "").toString().replace(/\D/g, "");
  if (!v) return "R$ 0,00";
  v = (parseInt(v, 10) / 100).toFixed(2);
  let [inteiro, dec] = v.split(".");
  inteiro = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return "R$ " + inteiro + "," + dec;
}

/** Converte "R$ 50.100,15" -> 50100.15 (Number) */
function parseMoedaBRToNumber(str) {
  if (!str) return 0;
  return parseFloat(
    str.replace(/[R$\s\.]/g, "").replace(",", ".")
  ) || 0;
}

/* ============================================================
   4) CARREGAMENTO DE DADOS (seguradoras // ramos)
   ============================================================ */

/**
 * Carrega seguradoras de /seguradoras (nome).
 * Se as rules bloquearem o read (permission-denied),
 * retorna lista vazia para não travar a UI.
 */
function carregarSeguradoras() {
  return db
    .collection("seguradoras")
    .get()
    .then((snap) => {
      const arr = [];
      snap.forEach((doc) => {
        const d = doc.data() || {};
        const n = (d.nome || "").toString().trim();
        if (n) arr.push(n);
      });
      return arr.sort((a, b) =>
        a.localeCompare(b, "pt-BR", { sensitivity: "base" })
      );
    })
    .catch((err) => {
      console.warn("[Firestore] seguradoras read negada/erro:", err?.code || err);
      return [];
    });
}

/**
 * Carrega ramos de /ramos-seguro, ordenando por "ordem".
 * Se falhar por permission-denied, devolve um fallback
 * básico para o cliente nunca ver a tela vazia.
 */
async function carregarRamosSeguro() {
  try {
    const snap = await db
      .collection("ramos-seguro")
      .orderBy("ordem")
      .get();

    const ramos = [];
    snap.forEach((doc) => {
      const data = doc.data() || {};
      ramos.push({
        id: doc.id,
        nome: data.nomeExibicao || data.nome || doc.id,
      });
    });

    if (ramos.length) return ramos;
  } catch (e) {
    console.warn("[Firestore] ramos-seguro read negada/erro:", e?.code || e);
  }

  // Fallback padrão (mantém experiência)
  return [
    { id: "auto",        nome: "Automóvel"     },
    { id: "vida",        nome: "Vida"          },
    { id: "saude",       nome: "Saúde"         },
    { id: "empresarial", nome: "Empresarial"   },
    { id: "residencial", nome: "Residencial"   },
  ];
}

/* ============================================================
   5) GERAÇÃO DA UI (mesma lógica do gerente)
   - Checkbox por ramo
   - Subcampos: vencimento, prêmio, seguradora, observações
   ============================================================ */
async function gerarCamposRamos() {
  // Busca dados em paralelo
  const [seguradoras, ramos] = await Promise.all([
    carregarSeguradoras(),
    carregarRamosSeguro(),
  ]);

  // Container na DOM
  const container = document.getElementById("ramos-container");
  if (!container) return;

  // Limpa
  container.innerHTML = "";

  // Para cada ramo, renderiza bloco com checkbox + subcampos
  ramos.forEach((ramo) => {
    // Caixa do ramo
    const box = document.createElement("div");
    box.className = "ramo-box";

    // Cabeçalho (checkbox + label)
    const head = document.createElement("div");
    head.className = "head";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "ramo";
    checkbox.value = ramo.id;
    checkbox.setAttribute("aria-label", `Selecionar ramo ${ramo.nome}`);

    const labelCheck = document.createElement("label");
    labelCheck.style.margin = "0";
    labelCheck.append(` ${ramo.nome}`);

    head.appendChild(checkbox);
    head.appendChild(labelCheck);
    box.appendChild(head);

    // Subcampos (escondidos até o usuário marcar o checkbox)
    const sub = document.createElement("div");
    sub.className = "subcampos";
    sub.id = `campos-${ramo.id}`;

    // Build innerHTML dos subcampos
    sub.innerHTML = `
      <label>Vencimento (dd/mm/aaaa):</label>
      <input type="text" id="${ramo.id}-vencimento" inputmode="numeric" placeholder="dd/mm/aaaa" maxlength="10">

      <label>Prêmio anual (R$):</label>
      <input type="text" id="${ramo.id}-premio" placeholder="R$ 0,00">

      <label>Seguradora:</label>
      <select id="${ramo.id}-seguradora">
        <option value="">Selecione</option>
        ${seguradoras.map((s) => `<option value="${s}">${s}</option>`).join("")}
      </select>

      <label>Observações:</label>
      <textarea id="${ramo.id}-observacoes" placeholder="Comentários ou detalhes adicionais..."></textarea>
    `;

    // Máscara de data
    const vencInput = sub.querySelector(`#${ramo.id}-vencimento`);
    vencInput.addEventListener("input", (e) => {
      e.target.value = maskDDMMYYYY(e.target.value);
    });

    // Máscara de moeda
    const premioInput = sub.querySelector(`#${ramo.id}-premio`);
    premioInput.addEventListener("input", (e) => {
      e.target.value = maskMoedaBR(e.target.value);
    });
    premioInput.addEventListener("focus", (e) => {
      if (!e.target.value) e.target.value = "R$ 0,00";
    });

    // Toggle de exibição dos subcampos
    checkbox.addEventListener("change", () => {
      sub.style.display = checkbox.checked ? "block" : "none";
    });

    // Anexa subcampos ao box
    box.appendChild(sub);

    // Anexa box ao container
    container.appendChild(box);
  });
}

/* ============================================================
   6) ENVIO (grava em /visitas como cliente_link)
   - Valida ao menos 1 ramo
   - Valida datas dd/mm/aaaa
   - Converte prêmio para número (float)
   ============================================================ */
async function enviar() {
  // Conferir empresaId
  if (!empresaId) {
    alert("Link inválido (sem empresa).");
    return;
  }

  // Tipo de visita fixo para o público
  const tipoVisita = "Cliente";

  // Nº de funcionários é opcional
  const numFuncStr = (document.getElementById("numFuncionarios")?.value || "").trim();
  const numeroFuncionarios = numFuncStr === "" ? null : Math.max(0, parseInt(numFuncStr, 10) || 0);

  // Usuário anônimo atual (pode ser null nos primeiros ms)
  const user = auth.currentUser;

  // Monta payload
  const visita = {
    source: "cliente_link",                          // <- sinalizador das rules
    empresaId: empresaId,
    empresaNome: empresaNome || "",
    tipoVisita: tipoVisita,
    rmNome: rmNomeURL || "",                         // opcional no link
    rmUid: null,                                     // não temos rmUid no público
    agenciaId: "",                                   // se quiser, preenche via CF depois
    usuarioId: user?.uid || null,
    criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    numeroFuncionarios: numeroFuncionarios,
    ramos: {}
  };

  // Loop nos ramos marcados
  let marcouAlgum = false;
  let erroVencimento = null;

  document.querySelectorAll(".ramo").forEach((input) => {
    if (!input.checked) return;

    marcouAlgum = true;

    const id = input.value;

    const vencStr = (document.getElementById(`${id}-vencimento`)?.value || "").trim();
    const premioStr = (document.getElementById(`${id}-premio`)?.value || "");
    const seguradoraSel = (document.getElementById(`${id}-seguradora`)?.value || "");
    const obs = (document.getElementById(`${id}-observacoes`)?.value || "");

    if (!validaDDMMYYYY(vencStr)) {
      erroVencimento = `Vencimento inválido em ${id}. Use dd/mm/aaaa.`;
    }

    visita.ramos[id] = {
      vencimento: vencStr,
      premio: parseMoedaBRToNumber(premioStr),
      seguradora: seguradoraSel,
      observacoes: obs
    };
  });

  // Regras básicas
  if (erroVencimento) {
    alert(erroVencimento);
    return;
  }
  if (!marcouAlgum) {
    alert("Marque pelo menos um ramo e preencha os campos.");
    return;
  }

  // Persistência
  try {
    await db.collection("visitas").add(visita);

    // Feedback simples na tela
    const ok = document.getElementById("ok");
    if (ok) ok.style.display = "block";

    // Se quiser redirecionar:
    // location.href = "obrigado.html";
  } catch (e) {
    console.error("[Firestore] erro ao salvar visita:", e);
    alert("Erro ao enviar. Tente novamente mais tarde.");
  }
}

// Exponho no escopo global para o botão do HTML
window.enviar = enviar;

/* ============================================================
   7) BOOTSTRAP DA PÁGINA
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  // Gera os ramos/inputs assim que a DOM estiver pronta
  gerarCamposRamos()
    .catch((e) => console.error("Falha ao gerar ramos:", e));
});
