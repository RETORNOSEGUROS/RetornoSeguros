if (!firebase.apps.length && typeof firebaseConfig!=="undefined") firebase.initializeApp(firebaseConfig);
const auth=firebase.auth(), db=firebase.firestore();
const RES=db.collection("resgates_carteira"), USERS=db.collection("usuarios_banco");

const $=id=>document.getElementById(id);
const brl=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});

let isAdmin=false, cache=[], mapUser={};

auth.onAuthStateChanged(async u=>{
  if(!u){ location.href="login.html"; return; }
  const prof=(await USERS.doc(u.uid).get()).data()||{};
  isAdmin = (prof.perfil||"").toLowerCase()==="admin" || u.email==="patrick@retornoseguros.com.br";
  if(!isAdmin){ alert("Somente admin."); location.href="painel.html"; return; }
  await carregar();
  $("btnAplicar").onclick=aplicar;
});

function asDate(x){
  try{
    if(!x) return null;
    if(typeof x==="string") return new Date(x);
    if(x instanceof Date) return x;
    if(x.toDate) return x.toDate();
  }catch(e){}
  return null;
}
function dateBR(x){
  const d=asDate(x);
  return d && !isNaN(+d) ? d.toLocaleDateString("pt-BR") : "-";
}
function esc(s=""){
  return String(s).replace(/[&<>"']/g,m=>({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[m]));
}

async function carregar(){
  // nomes dos usuários
  const us=await USERS.get(); us.forEach(d=>mapUser[d.id]=d.data()?.nome||d.id);

  // >>> carrega TODOS os resgates (pendentes, pagos e negados)
  const snap=await RES.get();
  cache = snap.docs.map(d=>({id:d.id,...(d.data()||{})}));
  aplicar(); // render com filtro atual
}

function aplicar(){
  const st=($("fStatus").value||"").toLowerCase();
  const q = ($("fUser").value||"").toLowerCase();

  let list=[...cache];
  if(st) list=list.filter(x=> (x.status||"").toLowerCase()===st);
  if(q)  list=list.filter(x=>{
    return (x.userNome||"").toLowerCase().includes(q) ||
           (x.userEmail||"").toLowerCase().includes(q);
  });

  render(list);
}

function render(list){
  const tb=$("tbody"); tb.innerHTML="";
  if(!list.length){
    tb.innerHTML=`<tr><td colspan="7" class="muted">Nada encontrado.</td></tr>`;
    $("count").textContent="0 item(ns)";
    $("soma").textContent="R$ 0,00";
    return;
  }

  let soma=0;
  list.forEach(r=>{
    const valor=Number(r.valor||0); soma+=valor;
    const nome = r.userNome || mapUser[r.userId] || r.userId || "-";
    const criado = dateBR(r.criadoISO || r.createdAt);
    const pagoOuNegado =
      r.status==="pago"    ? ` • pago em ${dateBR(r.pagoEm)}` :
      r.status==="negado"  ? ` • negado em ${dateBR(r.negadoEm)}` : "";

    const tr=document.createElement("tr");
    tr.innerHTML = `
      <td><div>${criado}${pagoOuNegado}</div></td>
      <td>${esc(nome)}</td>
      <td>${esc(r.metodo||"-")}</td>
      <td title="${esc(r.detalhes||"-")}"><div class="ellipsis">${esc(r.detalhes||"-")}</div></td>
      <td>${brl.format(valor)}</td>
      <td>${(r.status||"pendente")}</td>
      <td>
        ${ (r.status==="pendente")
          ? `<button class="btn" onclick="aprovar('${r.id}', ${valor})">Aprovar</button>
             <button class="btn out" onclick="negar('${r.id}')">Negar</button>`
          : `<span class="muted">—</span>`}
      </td>`;
    tb.appendChild(tr);
  });

  $("count").textContent = `${list.length} item(ns)`;
  $("soma").textContent  = brl.format(soma);
}

async function aprovar(id, valorSugerido){
  const v=prompt("Valor a pagar (pode ajustar):", String(valorSugerido).replace(".",","));
  if(v===null) return;
  const valorPago = Number(String(v).replace(/\./g,"").replace(",","."));
  if(isNaN(valorPago)||valorPago<=0) return alert("Valor inválido.");

  const obs=prompt("Observações (opcional):","");

  await RES.doc(id).set({
    status:"pago",
    valorSolicitado: Number((valorSugerido||0).toFixed(2)),
    valor: Number(valorPago.toFixed(2)),
    pagoEm: firebase.firestore.FieldValue.serverTimestamp(),
    aprovadoPorUid: auth.currentUser.uid,
    aprovadoPorEmail: auth.currentUser.email,
    obsAdmin: obs||""
  },{merge:true});

  alert("Resgate aprovado.");
  await carregar();
}

async function negar(id){
  const motivo=prompt("Motivo da negativa (opcional):","");
  await RES.doc(id).set({
    status:"negado",
    negadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    motivoAdmin: motivo||""
  },{merge:true});
  alert("Resgate negado.");
  await carregar();
}

// expõe se precisar no console
window.aplicar=aplicar;
