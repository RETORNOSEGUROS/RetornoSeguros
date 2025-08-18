if (!firebase.apps.length && typeof firebaseConfig!=="undefined") firebase.initializeApp(firebaseConfig);
const auth=firebase.auth(), db=firebase.firestore();
const RES=db.collection("resgates_carteira"), USERS=db.collection("usuarios_banco");
const $=id=>document.getElementById(id), brl=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});

let isAdmin=false, cache=[], mapUser={};

auth.onAuthStateChanged(async u=>{
  if(!u){ location.href="login.html"; return; }
  const prof=(await USERS.doc(u.uid).get()).data()||{};
  isAdmin = (prof.perfil||"").toLowerCase()==="admin" || u.email==="patrick@retornoseguros.com.br";
  if(!isAdmin){ alert("Somente admin."); location.href="painel.html"; return; }
  await carregar();
  $("btnAplicar").onclick=aplicar;
});

async function carregar(){
  // pré-carrega nomes
  const us=await USERS.get(); us.forEach(d=>mapUser[d.id]=d.data()?.nome||d.id);
  // pendentes por padrão
  const snap=await RES.where("status","==","pendente").get();
  cache = snap.docs.map(d=>({id:d.id,...(d.data()||{})}));
  render(cache);
}
function aplicar(){
  const st=$("fStatus").value, q= ($("fUser").value||"").toLowerCase();
  let list=cache;
  if(st) list=list.filter(x=> (x.status||"").toLowerCase()===st);
  if(q)  list=list.filter(x=> (x.userNome||"").toLowerCase().includes(q) || (x.userEmail||"").toLowerCase().includes(q));
  render(list);
}
function render(list){
  const tb=$("tbody"); tb.innerHTML="";
  if(!list.length){ tb.innerHTML=`<tr><td colspan="6" class="muted">Nada encontrado.</td></tr>`; $("count").textContent="0 item(ns)"; $("soma").textContent="R$ 0,00"; return; }
  let soma=0;
  list.forEach(r=>{
    const valor=Number(r.valor||0); soma+=valor;
    const tr=document.createElement("tr");
    const nome = r.userNome || mapUser[r.userId] || r.userId || "-";
    tr.innerHTML = `
      <td>${r.criadoISO||"-"}</td>
      <td>${nome}</td>
      <td>${r.metodo||"-"}</td>
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
  const valorPago = Number(String(v).replace(".","").replace(",","."));
  if(isNaN(valorPago)||valorPago<=0) return alert("Valor inválido.");

  const obs=prompt("Observações (opcional):","");

  // regra do front: guardamos o solicitado e sobrescrevemos 'valor' com o valor efetivamente pago.
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
  await carregar(); aplicar();
}

async function negar(id){
  const motivo=prompt("Motivo da negativa (opcional):","");
  await RES.doc(id).set({
    status:"negado",
    negadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    motivoAdmin: motivo||""
  },{merge:true});
  alert("Resgate negado.");
  await carregar(); aplicar();
}
