/**************************************************************
 * visita-cliente.js — Formulário público
 * ------------------------------------------------------------
 * - Lê empresa via querystring
 * - Faz login anônimo (cliente)
 * - Carrega ramos/seguradoras do Firestore (após auth)
 * - Salva em /visitas com source: "cliente_link"
 *
 * Requisitos:
 *   • Firebase v8 (app, firestore, auth)
 *   • Auth "Anonymous" habilitada no Firebase Console
 *   • Rules Firestore liberando read (ramos/seguradoras)
 *     e create em /visitas quando source == "cliente_link"
 **************************************************************/

/* ============================================================
   0) INICIALIZAÇÃO DO FIREBASE
   ============================================================ */
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db   = firebase.firestore();
const auth = firebase.auth();

/* ============================================================
   1) PARÂMETROS DO LINK (tolerantes)
   Aceita variações:
   - empresaId / empresa / idEmpresa / empresal
   - empresaNome / empresa_nome / nomeEmpresa
   - rmNome / rm / rm_nome
   ============================================================ */

// função utilitária para pegar parâmetros tolerando variações
const qp = new URLSearchParams(location.search);
function getQP(...keys) {
  for (const k of keys) {
    const v =
      qp.get(k) ||
      qp.get(k.toLowerCase()) ||
      qp.get(k.toUpperCase());
    if (v) return decodeURIComponent(v);
  }
  return "";
}

// parâmetros extraídos do link
const empresaId   = getQP("empresaId", "empresa", "idEmpresa", "empresal");
const empresaNome = getQP("empresaNome", "empresa_nome", "nomeEmpresa");
const rmNomeURL   = getQP("rmNome", "rm", "rm_nome");

// mostra nome da empresa no cabeçalho
const $empresaNome = document.getElementById("empresaNome");
const $empresaInfo = document.getElementById("empresaInfo");
if ($empresaNome) $empresaNome.textContent = empresaNome || "(Empresa)";
if ($empresaInfo) $empresaInfo.textContent = empresaNome ? `Empresa: ${empresaNome}` : "";

/* ============================================================
   2) LOGIN ANÔNIMO
   ============================================================ */
auth.signInAnonymously().catch((err) => {
  console.error("[Auth] Falha no login anônimo:", err);
});

/* ============================================================
   3) HELPERS (máscaras e validações)
   ============================================================ */

// aplica máscara dd/mm/aaaa
function maskDDMMYYYY(value) {
  let v = (value || "").replace(/\D/g, "").slice(0, 8);
  if (v.length >= 5) {
    v = v.slice(0, 2) + "/" + v.slice(2, 4) + "/" + v.slice(4);
  } else if (v.length >= 3) {
    v = v.slice(0, 2) + "/" + v.slice(2);
  }
  return v;
}

// valida se a string é uma data dd/mm/aaaa real
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

// formata em moeda BR (R$ 0,00)
function maskMoedaBR(v) {
  v = (v || "").toString().replace(/\D/g, "");
  if (!v) return "R$ 0,00";
  v = (parseInt(v, 10) / 100).toFixed(2);
  let [inteiro, dec] = v.split(".");
  inteiro = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return "R$ " + inteiro + "," + dec;
}

// converte string moeda BR em número float
function parseMoedaBRToNumber(str) {
  if (!str) return 0;
  return parseFloat(
    str.replace(/[R$\s\.]/g, "").replace(",", ".")
  ) || 0;
}

/* ============================================================
   4) CARREGAMENTO DE DADOS
   ============================================================ */

// carrega seguradoras da coleção /seguradoras
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
      console.warn("[Firestore] seguradoras: erro/negado:", err?.code || err);
      return [];
    });
}

// carrega ramos da coleção /ramos-seguro
async function carregarRamosSeguro() {
  try {
    // tentativa com orderBy("ordem")
    const snap = await db.collection("ramos-seguro").orderBy("ordem").get();
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
    console.warn("[Firestore] ramos-seguro com orderBy falhou:", e?.code || e);
    // fallback sem orderBy
    try {
      const snap = await db.collection("ramos-seguro").get();
      const ramos = [];
      snap.forEach((doc) => {
        const data = doc.data() || {};
        ramos.push({
          id: doc.id,
          nome: data.nomeExibicao || data.nome || doc.id,
        });
      });
      if (ramos.length) return ramos;
    } catch (e2) {
      console.warn("[Firestore] ramos-seguro sem orderBy falhou:", e2?.code || e2);
    }
  }

  // fallback fixo se nada der certo
  return [
    { id: "auto",        nome: "Automóvel"     },
    { id: "vida",        nome: "Vida"          },
    { id: "saude",       nome: "Saúde"         },
    { id: "empresarial", nome: "Empresarial"   },
    { id: "residencial", nome: "Residencial"   },
  ];
}

/* ============================================================
   5) MONTAGEM DA INTERFACE
   ============================================================ */
async function gerarCamposRamos() {
  const [seguradoras, ramos] = await Promise.all([
    carregarSeguradoras(),
    carregarRamosSeguro(),
  ]);

  const container = document.getElementById("ramos-container");
  if (!container) return;
  container.innerHTML = "";

  ramos.forEach((ramo) => {
    // cria box
    const box = document.createElement("div");
    box.className = "ramo-box";

    // cabeçalho com checkbox
    const head = document.createElement("div");
    head.className = "head";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "ramo";
    checkbox.value = ramo.id;

    const labelCheck = document.createElement("label");
    labelCheck.style.margin = "0";
    labelCheck.append(" " + ramo.nome);

    head.appendChild(checkbox);
    head.appendChild(labelCheck);
    box.appendChild(head);

    // subcampos (invisíveis até marcar checkbox)
    const sub = document.createElement("div");
    sub.className = "subcampos";
    sub.id = `campos-${ramo.id}`;
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

    // máscaras
    sub.querySelector(`#${ramo.id}-vencimento`).addEventListener("input", (e) => {
      e.target.value = maskDDMMYYYY(e.target.value);
    });
    const premioInput = sub.querySelector(`#${ramo.id}-premio`);
    premioInput.addEventListener("input", (e) => {
      e.target.value = maskMoedaBR(e.target.value);
    });

    // toggle de exibição
    checkbox.addEventListener("change", () => {
      sub.style.display = checkbox.checked ? "block" : "none";
    });

    box.appendChild(sub);
    container.appendChild(box);
  });
}

/* ============================================================
   6) ENVIO
   ============================================================ */
async function enviar() {
  if (!empresaId) {
    alert("Link inválido (sem empresa).");
    return;
  }

  const tipoVisita = "Cliente";
  const numFuncStr = (document.getElementById("numFuncionarios")?.value || "").trim();
  const numeroFuncionarios = numFuncStr === "" ? null : Math.max(0, parseInt(numFuncStr, 10) || 0);
  const user = auth.currentUser;

  const visita = {
    source: "cliente_link",
    empresaId,
    empresaNome,
    tipoVisita,
    rmNome: rmNomeURL || "",
    rmUid: null,
    agenciaId: "",
    usuarioId: user?.uid || null,
    criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    numeroFuncionarios,
    ramos: {}
  };

  let marcouAlgum = false;
  let erroVenc = null;

  document.querySelectorAll(".ramo").forEach((input) => {
    if (!input.checked) return;

    marcouAlgum = true;
    const id = input.value;

    const vencStr = (document.getElementById(`${id}-vencimento`)?.value || "").trim();
    const premioStr = (document.getElementById(`${id}-premio`)?.value || "");
    const seguradoraSel = (document.getElementById(`${id}-seguradora`)?.value || "");
    const obs = (document.getElementById(`${id}-observacoes`)?.value || "");

    if (!validaDDMMYYYY(vencStr)) {
      erroVenc = `Vencimento inválido em ${id}. Use dd/mm/aaaa.`;
    }

    visita.ramos[id] = {
      vencimento: vencStr,
      premio: parseMoedaBRToNumber(premioStr),
      seguradora: seguradoraSel,
      observacoes: obs
    };
  });

  if (erroVenc) {
    alert(erroVenc);
    return;
  }
  if (!marcouAlgum) {
    alert("Marque pelo menos um ramo.");
    return;
  }

  try {
    await db.collection("visitas").add(visita);
    document.getElementById("ok").style.display = "block";
  } catch (e) {
    console.error("[Firestore] erro ao salvar visita:", e);
    alert("Erro ao enviar. Tente novamente.");
  }
}
window.enviar = enviar;

/* ============================================================
   7) BOOTSTRAP — só gera UI após login anônimo
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  auth.onAuthStateChanged((user) => {
    if (!user) return;
    gerarCamposRamos().catch((e) => console.error("Falha ao gerar ramos:", e));
  });
});
