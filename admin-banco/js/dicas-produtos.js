const ADMIN_EMAIL = "patrick@retornoseguros.com.br";
let db, userEmail;

firebase.auth().onAuthStateChanged(user => {
  if (!user) {
    alert("Você precisa estar logado para acessar.");
    window.location.href = "../index.html";
    return;
  }

  userEmail = user.email;
  db = firebase.firestore();
  carregarDicas();
});

function carregarDicas() {
  db.collection("dicas_produtos").orderBy("nomeProduto").get().then(snapshot => {
    const container = document.getElementById("container");
    container.innerHTML = "";

    snapshot.forEach(doc => {
      const data = doc.data();
      const id = doc.id;

      if (userEmail === ADMIN_EMAIL) {
        container.appendChild(criarCardEdicao(id, data));
      } else {
        container.appendChild(criarTextoCorrido(data));
      }
    });
  });
}

function criarCardEdicao(id, data) {
  const div = document.createElement("div");
  div.className = "card";

  div.innerHTML = `
    <h2>${data.nomeProduto}</h2>
    <label>O que é:</label>
    <textarea id="desc-${id}">${data.descricao || ''}</textarea>

    <label>O que pedir para cotar:</label>
    <textarea id="pedir-${id}">${data.oQuePedir || ''}</textarea>

    <label>Dicas comerciais:</label>
    <textarea id="dicas-${id}">${data.dicas || ''}</textarea>

    <label>Gatilhos mentais:</label>
    <textarea id="gatilhos-${id}">${data.gatilhos || ''}</textarea>

    <button onclick="salvar('${id}')">Salvar</button>
  `;

  return div;
}

function criarTextoCorrido(data) {
  const div = document.createElement("div");
  div.className = "card";

  const textoFormatado = `
📌 *${data.nomeProduto}*

📝 *O que é:* ${data.descricao || ''}

📋 *O que pedir para cotar:* ${data.oQuePedir || ''}

💡 *Dicas comerciais:* ${data.dicas || ''}

🎯 *Gatilhos mentais:* ${data.gatilhos || ''}
`.trim();

  div.innerHTML = `
    <h2>${data.nomeProduto}</h2>
    <div class="texto-corrido">
      <strong>O que é:</strong> ${data.descricao || ''}
      <strong>O que pedir para cotar:</strong> ${data.oQuePedir || ''}
      <strong>Dicas comerciais:</strong> ${data.dicas || ''}
      <strong>Gatilhos mentais:</strong> ${data.gatilhos || ''}
    </div>
    <button onclick="copiarParaWhatsapp(\`${textoFormatado}\`)">📲 Copiar texto para WhatsApp</button>
  `;

  return div;
}

function copiarParaWhatsapp(texto) {
  navigator.clipboard.writeText(texto).then(() => {
    alert("Texto copiado! Agora é só colar no WhatsApp.");
  }).catch(err => {
    console.error("Erro ao copiar:", err);
    alert("Erro ao copiar o texto.");
  });
}

function salvar(id) {
  const docRef = db.collection("dicas_produtos").doc(id);
  const descricao = document.getElementById(`desc-${id}`).value.trim();
  const oQuePedir = document.getElementById(`pedir-${id}`).value.trim();
  const dicas = document.getElementById(`dicas-${id}`).value.trim();
  const gatilhos = document.getElementById(`gatilhos-${id}`).value.trim();

  docRef.update({
    descricao,
    oQuePedir,
    dicas,
    gatilhos
  }).then(() => {
    alert("Dica atualizada com sucesso!");
  }).catch(err => {
    console.error("Erro ao salvar:", err);
    alert("Erro ao salvar.");
  });
}
