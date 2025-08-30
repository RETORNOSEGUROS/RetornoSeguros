// --- Firebase v8 ---
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db   = firebase.firestore();

/* =======================
   Estado/Perfil
   ======================= */
let usuarioAtual = null;
let perfilAtual  = "";          // "admin" | "gerente chefe" | "assistente" | "rm" | ...
let minhaAgencia = "";
let isAdmin      = false;

// Mapa auxiliar das empresas carregadas (para obter agenciaId/rm na hora de salvar)
const empresaMetaMap = new Map(); // empresaId -> { nome, agenciaId, rmUid, rmNome }

/* =======================
   Helpers de texto/perfil
   ======================= */
// normaliza textos (remove acento, minúsculo)
const normalize = (s) =>
  (s || "")
    .toString()
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase().trim();

// troca "_" e "-" por espaço e normaliza
const roleNorm = (s) => normalize(s).replace(/[-_]+/g, " ");

/* =======================
   Helpers de máscara/validação (mantidos)
   ======================= */

// dd/mm/aaaa enquanto digita (aceita só números)
function maskDDMMYYYY(value) {
  let v = (value || "").replace(/\D/g, "").slice(0, 8);
  if (v.length >= 5) v = v.slice(0, 2) + "/" + v.slice(2, 4) + "/" + v.slice(4);
  else if (v.length >= 3) v = v.slice(0, 2) + "/" + v.slice(2);
  return v;
}

function validaDDMMYYYY(v) {
  if (!v) return true;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if (!m) return false;
  const d = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const y = parseInt(m[3], 10);
  if (d < 1 || d > 31 || mo < 1 || mo > 12 || y < 1900) return false;
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === (mo - 1) && dt.getDate() === d;
}

// moeda BR em tempo real
function maskMoedaBR(v) {
  v = (v || "").toString().replace(/\D/g, "");
  if (!v) return "R$ 0,00";
  v = (parseInt(v, 10) / 100).toFixed(2);
  let [int, dec] = v.split(".");
  int = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return "R$ " + int + "," + dec;
}

// parse "R$ 50.100,15" -> 50100.15
function parseMoedaBRToNumber(str) {
  if (!str) return 0;
  return parseFloat(str.replace(/[R$\s\.]/g, "").replace(",", ".")) || 0;
}

/* =======================
   Perfil do usuário
   ======================= */
async function getPerfilAgencia() {
  const user = auth.currentUser;
  if (!user) return { perfil:"", agenciaId:"", isAdmin:false, nome:"" };
  const udoc = await db.collection("usuarios_banco").doc(user.uid).get();
  const d = udoc.exists ? (udoc.data() || {}) : {};
  const perfil = roleNorm(d.perfil || d.roleId || "");
  const agenciaId = d.agenciaId || "";
  const admin = (perfil === "admin") || (user.email === "patrick@retornoseguros.com.br");
  return { perfil, agenciaId, isAdmin: admin, nome: d.nome || user.email || "" };
}

/* =======================
   Carregamentos
   ======================= */

async function carregarEmpresas() {
  const select = document.getElementById("empresa");
  const infoEmpresa = document.getElementById("infoEmpresa");
  const rmNomeSpan = document.getElementById("rmNome");

  if (!select) return;

  select.innerHTML = `<option value="">Carregando empresas...</option>`;
  empresaMetaMap.clear();

  // monta queries por perfil
  const colEmp = db.collection("empresas");
  const buckets = [];

  if (isAdmin) {
    try { buckets.push(await colEmp.orderBy("nome").get()); }
    catch { buckets.push(await colEmp.get()); }
  } else if (["gerente chefe","assistente"].includes(perfilAtual)) {
    if (minhaAgencia) {
      try { buckets.push(await colEmp.where("agenciaId","==",minhaAgencia).orderBy("nome").get()); }
      catch { buckets.push(await colEmp.where("agenciaId","==",minhaAgencia).get()); }
    }
  } else {
    try { buckets.push(await colEmp.where("rmUid","==",usuarioAtual.uid).get()); } catch(e){}
    try { buckets.push(await colEmp.where("rmId","==", usuarioAtual.uid).get()); } catch(e){}
    try { buckets.push(await colEmp.where("usuarioId","==",usuarioAtual.uid).get()); } catch(e){}
    try { buckets.push(await colEmp.where("gerenteId","==",usuarioAtual.uid).get()); } catch(e){}
  }

  // mescla por ID
  const map = new Map();
  buckets.forEach(snap => {
    snap?.forEach?.(doc => map.set(doc.id, doc));
    if (snap?.docs) snap.docs.forEach(doc => map.set(doc.id, doc));
  });

  const docs = Array.from(map.values()).map(d => ({ id: d.id, ...d.data() }))
    .sort((a,b)=> (a.nome||"").localeCompare(b.nome||"", "pt-BR"));

  // render
  select.innerHTML = `<option value="">Selecione uma empresa</option>`;
  docs.forEach(data => {
    const option = document.createElement("option");
    option.value = data.id;
    option.textContent = data.nome || "(Sem nome)";

    const rmNome = data.rmNome || data.rm || data.rm_nome || "Não informado";
    option.setAttribute("data-rm", rmNome);

    empresaMetaMap.set(data.id, {
      nome: data.nome || "(Sem nome)",
      agenciaId: data.agenciaId || "",
      rmUid: data.rmUid || data.rmId || null,
      rmNome: rmNome
    });

    select.appendChild(option);
  });

  // mostra RM quando trocar a empresa
  select.addEventListener("change", () => {
    const selectedOption = select.options[select.selectedIndex];
    const rmNome = selectedOption.getAttribute("data-rm") || "Não informado";
    rmNomeSpan.textContent = rmNome;
    infoEmpresa.style.display = selectedOption.value ? "block" : "none";
  });
}

function carregarSeguradoras() {
  return db.collection("seguradoras").get()
    .then(snapshot => {
      const arr = [];
      snapshot.forEach(doc => {
        const n = (doc.data() && doc.data().nome) ? String(doc.data().nome).trim() : null;
        if (n) arr.push(n);
      });
      return arr.sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
    })
    .catch(err => {
      console.error("Erro ao carregar seguradoras:", err);
      return [];
    });
}

async function carregarRamosSeguro() {
  try {
    const snapshot = await db.collection("ramos-seguro").orderBy("ordem").get();
    const ramos = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      ramos.push({ id: doc.id, nome: data.nomeExibicao || data.nome || doc.id });
    });
    if (ramos.length) return ramos;

    return [
      { id: "auto", nome: "Automóvel" },
      { id: "vida", nome: "Vida" },
      { id: "saude", nome: "Saúde" },
      { id: "dental", nome: "Dental" },
      { id: "empresarial", nome: "Empresarial" },
      { id: "residencial", nome: "Residencial" },
      { id: "equipamentos", nome: "Equipamentos" },
      { id: "frota", nome: "Frota" },
      { id: "rc", nome: "Responsabilidade Civil" },
      { id: "transportes", nome: "Transportes" }
    ];
  } catch (e) {
    console.error("Erro ao carregar ramos-seguro:", e);
    return [
      { id: "auto", nome: "Automóvel" },
      { id: "vida", nome: "Vida" },
      { id: "saude", nome: "Saúde" },
      { id: "dental", nome: "Dental" },
      { id: "empresarial", nome: "Empresarial" }
    ];
  }
}

/* =======================
   UI dinâmica dos ramos
   ======================= */

async function gerarCamposRamos(seguradoras) {
  const ramos = await carregarRamosSeguro();
  const container = document.getElementById("ramos-container");
  container.innerHTML = "";

  if (!ramos.length) {
    container.innerHTML = `<div style="padding:12px;border:1px solid #e5e7eb;border-radius:10px;background:#fff7ed;color:#7c2d12;">
      Não há ramos configurados. Configure em <strong>ramos-seguro</strong> no Firestore.
    </div>`;
    return;
  }

  ramos.forEach(ramo => {
    const box = document.createElement("div");
    box.className = "ramo-box";

    const head = document.createElement("div");
    head.className = "head";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "ramo";
    checkbox.value = ramo.id;

    const labelCheck = document.createElement("label");
    labelCheck.style.margin = "0";
    labelCheck.append(` ${ramo.nome}`);

    head.appendChild(checkbox);
    head.appendChild(labelCheck);
    box.appendChild(head);

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
        ${seguradoras.map(s => `<option value="${s}">${s}</option>`).join("")}
      </select>

      <label>Observações:</label>
      <textarea id="${ramo.id}-observacoes" placeholder="Comentários ou detalhes adicionais..."></textarea>
    `;

    const vencInput = sub.querySelector(`#${ramo.id}-vencimento`);
    vencInput.addEventListener("input", (e) => {
      e.target.value = maskDDMMYYYY(e.target.value);
    });

    const premioInput = sub.querySelector(`#${ramo.id}-premio`);
    premioInput.addEventListener("input", (e) => {
      e.target.value = maskMoedaBR(e.target.value);
    });
    premioInput.addEventListener("focus", (e) => {
      if (!e.target.value) e.target.value = "R$ 0,00";
    });

    checkbox.addEventListener("change", () => {
      sub.style.display = checkbox.checked ? "block" : "none";
    });

    box.appendChild(sub);
    container.appendChild(box);
  });
}

/* =======================
   Salvar (grava agenciaId/rm e numeroFuncionarios)
   ======================= */

function registrarVisita() {
  const empresaSelect = document.getElementById("empresa");
  const empresaId = empresaSelect?.value || "";
  const tipoVisitaSelect = document.getElementById("tipoVisita");
  const tipoVisita = tipoVisitaSelect ? tipoVisitaSelect.value : "";
  const empresaNome = empresaSelect?.options?.[empresaSelect.selectedIndex]?.textContent || "";

  const numFuncStr = (document.getElementById("numFuncionarios")?.value || "").trim();
  const numeroFuncionarios = numFuncStr === "" ? null : Math.max(0, parseInt(numFuncStr, 10) || 0);

  if (!empresaId)  return alert("Selecione a empresa.");
  if (!tipoVisita) return alert("Selecione o tipo da visita.");

  const meta = empresaMetaMap.get(empresaId) || {};
  const agenciaDaEmpresa = meta.agenciaId || "";
  const rmUidEmpresa     = meta.rmUid || null;
  const rmNomeEmpresa    = meta.rmNome || (empresaSelect.options[empresaSelect.selectedIndex]?.getAttribute("data-rm") || "");

  auth.onAuthStateChanged(async (user) => {
    if (!user) { alert("Usuário não autenticado."); return; }

    if (perfilAtual === "rm" && agenciaDaEmpresa && minhaAgencia && agenciaDaEmpresa !== minhaAgencia) {
      alert("Você só pode registrar visitas de empresas da sua agência.");
      return;
    }

    const visita = {
      empresaId,
      empresaNome,
      tipoVisita,
      rmNome: rmNomeEmpresa || "Não informado",
      rmUid:  rmUidEmpresa || null,
      agenciaId: agenciaDaEmpresa || minhaAgencia || "",
      usuarioId: user.uid,
      criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
      numeroFuncionarios,
      ramos: {}
    };

    let algumRamo = false;
    let erroVenc = null;

    document.querySelectorAll(".ramo").forEach(input => {
      if (input.checked) {
        algumRamo = true;
        const id = input.value;

        const vencimentoStr = (document.getElementById(`${id}-vencimento`).value || "").trim();
        const premioStr = document.getElementById(`${id}-premio`).value || "";
        const premioNum = parseMoedaBRToNumber(premioStr);
        const seguradoraSel = document.getElementById(`${id}-seguradora`).value || "";
        const obs = document.getElementById(`${id}-observacoes`).value || "";

        if (!validaDDMMYYYY(vencimentoStr)) {
          erroVenc = `Vencimento inválido em ${id}. Use dd/mm/aaaa.`;
        }

        visita.ramos[id] = {
          vencimento: vencimentoStr,
          premio: premioNum,
          seguradora: seguradoraSel,
          observacoes: obs
        };
      }
    });

    if (erroVenc) return alert(erroVenc);
    if (!algumRamo) return alert("Marque pelo menos um ramo e preencha os campos.");

    try {
      await db.collection("visitas").add(visita);
      alert("Visita registrada com sucesso.");
      location.reload();
    } catch (err) {
      console.error("Erro ao registrar visita:", err);
      alert("Erro ao salvar visita.");
    }
  });
}

/* =======================
   Bootstrap
   ======================= */
window.addEventListener("DOMContentLoaded", async () => {
  auth.onAuthStateChanged(async (user) => {
    if (!user) return (window.location.href = "login.html");
    usuarioAtual = user;

    const ctx = await getPerfilAgencia();
    perfilAtual  = ctx.perfil;
    minhaAgencia = ctx.agenciaId;
    isAdmin      = ctx.isAdmin;

    await carregarEmpresas();
    const seguradoras = await carregarSeguradoras();
    await gerarCamposRamos(seguradoras);
  });
});

window.registrarVisita = registrarVisita;

/* ============================================================
   ADIÇÕES: PDF 1 página e GERAR LINK (com rmNome no URL)
   ============================================================ */

function coletarDadosFormulario() {
  const empresaSelect = document.getElementById("empresa");
  const tipoVisita = (document.getElementById("tipoVisita")?.value || "").trim();
  const empresaId = empresaSelect?.value || "";
  const empresaNome = empresaSelect?.options?.[empresaSelect.selectedIndex]?.textContent || "";
  const rmNome = document.getElementById("rmNome")?.textContent || "";
  const numFuncionarios = (document.getElementById("numFuncionarios")?.value || "").trim();

  const ramos = [];
  document.querySelectorAll(".ramo").forEach(input => {
    const id = input.value;
    const label = input.parentElement?.textContent?.trim() || id.toUpperCase();
    ramos.push({ id, nome: label });
  });

  return { empresaId, empresaNome, tipoVisita, rmNome, numFuncionarios, ramos };
}

async function gerarPDF() {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const dados = coletarDadosFormulario();
  if (!dados.empresaId) { alert("Selecione a empresa para gerar o PDF."); return; }

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const form = pdf.getForm();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  const M = 28, W = page.getWidth(), H = page.getHeight();
  const innerW = W - M*2;
  let y = H - M;

  const now = new Date();
  const dataStr = `${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR')}`;
  page.drawText(`Data: ${dataStr}`, { x:M, y, size:12, font, color:rgb(0,0.25,0.5) });
  y -= 14;

  const headerLine = (label, value, key) => {
    page.drawText(label, { x:M, y, size:9, font, color:rgb(0.2,0.2,0.2) });
    const tf = form.createTextField(key);
    tf.setText(value || "");
    tf.addToPage(page, { x:M+140, y:y-2, width:innerW-140, height:14 });
    y -= 20;
  };
  headerLine("Empresa", dados.empresaNome, "hdr_empresa");
  headerLine("Tipo de visita", dados.tipoVisita || "Presencial", "hdr_tipo");
  headerLine("RM responsável", dados.rmNome || "", "hdr_rm");
  headerLine("Nº de funcionários", dados.numFuncionarios || "", "hdr_func");

  y -= 2;
  page.drawLine({ start:{x:M,y}, end:{x:W-M,y}, thickness:1, color:rgb(0.86,0.89,0.94) });
  y -= 12;

  page.drawText('Mapeamento de Seguros (linhas em branco para anotar)', { x:M, y, size:11, font, color:rgb(0,0.25,0.5) });
  y -= 12;

  const cols = [
    { key:"ramo",       label:"Ramo",        w:100 },
    { key:"venc",       label:"Vencimento",  w:80  },
    { key:"premio",     label:"Prêmio anual (R$)", w:110 },
    { key:"seguradora", label:"Seguradora",  w:120 },
    { key:"obs",        label:"Observações", w: innerW - (100+80+110+120) }
  ];
  let x = M;
  cols.forEach(c => { page.drawText(c.label, {x, y, size:9, font, color:rgb(0.2,0.2,0.2)}); x += c.w; });
  y -= 8;
  page.drawLine({ start:{x:M,y}, end:{x:W-M,y}, thickness:1, color:rgb(0.86,0.89,0.94) });
  y -= 6;

  const rowH = 16, footerReserved = 64;
  const maxRows = Math.max(0, Math.floor((y - M - footerReserved) / rowH));
  const visiveis = (dados.ramos || []).slice(0, maxRows);
  const extras = Math.max(0, (dados.ramos || []).length - visiveis.length);

  const addField = (fx,fy,w,h,name,text="")=>{
    const f = form.createTextField(name);
    f.setText(text);
    f.addToPage(page,{x:fx,y:fy,width:w,height:h});
  };

  for (let i=0;i<visiveis.length;i++){
    const r = visiveis[i];
    let cx = M; const cy = y - rowH + 2;
    addField(cx,cy,cols[0].w-2,rowH-2,`row_${i}_ramo`, r.nome);       cx+=cols[0].w;
    addField(cx,cy,cols[1].w-2,rowH-2,`row_${i}_venc`, "");           cx+=cols[1].w;
    addField(cx,cy,cols[2].w-2,rowH-2,`row_${i}_premio`, "");         cx+=cols[2].w;
    addField(cx,cy,cols[3].w-2,rowH-2,`row_${i}_seg`, "");            cx+=cols[3].w;
    addField(cx,cy,cols[4].w-2,rowH-2,`row_${i}_obs`, "");
    y -= rowH;
  }
  if (extras>0){
    page.drawText(`+${extras} ramos adicionais (ver sistema)`, { x:M, y:y-2, size:9, font, color:rgb(0.4,0.1,0.1) });
    y -= 12;
  }

  y -= 2;
  page.drawLine({ start:{x:M,y}, end:{x:W-M,y}, thickness:1, color:rgb(0.86,0.89,0.94) });
  y -= 10;
  page.drawText('Anotações (editável):', { x:M, y, size:10, font, color:rgb(0.2,0.2,0.2) });
  const notas = form.createTextField('anotacoes_visita');
  const notasH = Math.max(34, (y - M) - 16);
  notas.setText('');
  notas.addToPage(page,{ x:M, y:y-notasH, width:innerW, height:notasH });

  form.updateFieldAppearances(font);
  const pdfBytes = await pdf.save();

  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Visita_${(dados.empresaNome || "empresa").replace(/\s+/g,'_')}.pdf`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function gerarLink() {
  const empresaSel  = document.getElementById("empresa");
  const empresaId   = empresaSel?.value || "";
  const empresaNome = empresaSel?.options?.[empresaSel.selectedIndex]?.textContent || "";
  const rmNome      = empresaSel?.options?.[empresaSel.selectedIndex]?.getAttribute("data-rm") || "";

  if (!empresaId) { alert("Selecione a empresa antes de gerar o link."); return; }

  const baseDir = location.origin + location.pathname.replace(/[^\/]+$/, ''); // mesma pasta do visitas.html
  const url = `${baseDir}visita-cliente.html?empresaId=${encodeURIComponent(empresaId)}&empresaNome=${encodeURIComponent(empresaNome)}&rmNome=${encodeURIComponent(rmNome)}`;

  try { navigator.clipboard.writeText(url); } catch(e) {}
  alert("Link copiado!\n\n" + url + "\n\nCole onde preferir (e-mail, WhatsApp, SMS).");
  console.log("Link do cliente:", url);
}

window.gerarPDF  = gerarPDF;
window.gerarLink = gerarLink;
