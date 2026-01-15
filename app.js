const $ = (q, el=document) => el.querySelector(q);
const $$ = (q, el=document) => Array.from(el.querySelectorAll(q));

let state = {
  view: "today",
  day: DB.ymd(new Date()),
  selectedPersonId: null,
};

function setSubtitle(text){ $("#appSub").textContent = text; }

function openModal(id){ const m = $("#"+id); if(m) m.setAttribute("aria-hidden","false"); }
function closeModal(id){ const m = $("#"+id); if(m) m.setAttribute("aria-hidden","true"); }

function escapeHtml(s=""){
  return s.replace(/[&<>"']/g, (m)=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));
}

function formatDayLabel(dateYMD){
  const d = new Date(dateYMD+"T12:00:00");
  const today = DB.ymd(new Date());
  const tomorrow = DB.ymd(new Date(Date.now()+86400000));
  if(dateYMD===today) return "Hoje";
  if(dateYMD===tomorrow) return "Amanhã";
  const wd = d.toLocaleDateString("pt-BR",{weekday:"long"});
  return wd.charAt(0).toUpperCase()+wd.slice(1);
}
function formatDateFull(dateYMD){
  const d = new Date(dateYMD+"T12:00:00");
  return d.toLocaleDateString("pt-BR",{day:"2-digit", month:"long", year:"numeric"});
}
function fmtBRL(v){ return Number(v||0).toLocaleString('pt-BR',{style:'currency', currency:'BRL'}); }

function switchView(view){
  state.view = view;
  $$(".tab").forEach(b => b.classList.toggle("active", b.dataset.view===view));
  $$(".view").forEach(v => v.classList.remove("active"));
  $("#view-"+view).classList.add("active");

  if(view==="today") setSubtitle("Agora & Próximo");
  if(view==="people") setSubtitle("Memória longitudinal");
  if(view==="cash") setSubtitle("Fluxo de caixa");
  if(view==="docs") setSubtitle("Documentos");
}

async function refreshPersonSelect(){
  const people = await DB.listPeople("");
  const sel = $("#fPerson");
  sel.innerHTML =
    `<option value="">(sem pessoa)</option>` +
    people.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
}

function suggestNowNext(tasks, appts){
  const notDone = tasks.filter(t => !t.done);
  const must = notDone.filter(t => t.bucket==="must");
  const money = notDone.filter(t => t.bucket==="money");
  const extra = notDone.filter(t => t.bucket==="extra");
  let now = must[0] || money[0] || extra[0] || null;

  const pendingAppt = appts.find(a => a.status==="pendente");
  let next = null;

  if(now){
    next = (must[1] || (money[0] && money[0].id!==now.id ? money[0] : money[1]) || extra[0] || null) || null;
  } else if(pendingAppt){
    next = {text: `${pendingAppt.time || "--:--"} — ${pendingAppt.text}`, bucket:"appt"};
  }
  return {now, next};
}

function heroItem(obj, peopleMap){
  const who = obj.personId ? (peopleMap.get(obj.personId)?.name || "") : "";
  const tag = obj.bucket==="must" ? `<span class="pill red">NÃO FALHAR</span>` :
              obj.bucket==="money" ? `<span class="pill green">DINHEIRO</span>` :
              obj.bucket==="extra" ? `<span class="pill blue">EXTRA</span>` :
              `<span class="pill blue">PRÓXIMO</span>`;
  const done = obj.done ? `<span class="pill done">feito</span>` : "";
  return `
    <div class="item" style="margin-top:6px;">
      <div class="itemLeft">
        <div class="itemTitle">${escapeHtml(obj.text || "")}</div>
        <div class="itemMeta">${escapeHtml(who)}</div>
      </div>
      <div class="pills">${tag}${done}</div>
    </div>
  `;
}

function taskRow(t, peopleMap){
  const el = document.createElement("div");
  el.className = "item";
  const who = t.personId ? (peopleMap.get(t.personId)?.name || "") : "";
  el.innerHTML = `
    <div class="itemLeft">
      <div class="itemTitle">${escapeHtml(t.text)}</div>
      <div class="itemMeta">${escapeHtml(who)} • ${t.done ? "feito" : "pendente"}</div>
    </div>
    <div class="row gap">
      <button class="btn small ghost" data-act="toggle">${t.done ? "Desfazer" : "Feito"}</button>
      <button class="btn small" data-act="edit">Editar</button>
    </div>
  `;
  el.querySelector('[data-act="toggle"]').onclick = async () => {
    await DB.upsertTask({...t, done: !t.done});
    await renderToday();
  };
  el.querySelector('[data-act="edit"]').onclick = () => openEditor({kind:"task", bucket:t.bucket, item:t});
  return el;
}

function apptRow(a, peopleMap){
  const el = document.createElement("div");
  el.className = "item";
  const who = a.personId ? (peopleMap.get(a.personId)?.name || "") : "";
  const pill = a.status==="feito" ? "green" : a.status==="faltou" ? "red" : "blue";
  el.innerHTML = `
    <div class="itemLeft">
      <div class="itemTitle">${escapeHtml(a.time || "--:--")} — ${escapeHtml(a.text)}</div>
      <div class="itemMeta">${escapeHtml(who)}</div>
    </div>
    <div class="row gap">
      <span class="pill ${pill}">${escapeHtml(a.status)}</span>
      <button class="btn small ghost" data-act="done">Feito</button>
      <button class="btn small ghost" data-act="miss">Faltou</button>
      <button class="btn small" data-act="edit">Editar</button>
    </div>
  `;
  el.querySelector('[data-act="done"]').onclick = async () => { await DB.upsertAppt({...a, status:"feito"}); await renderToday(); };
  el.querySelector('[data-act="miss"]').onclick = async () => { await DB.upsertAppt({...a, status:"faltou"}); await renderToday(); };
  el.querySelector('[data-act="edit"]').onclick = () => openEditor({kind:"appt", item:a});
  return el;
}

async function renderToday(){
  $("#dayLabel").textContent = formatDayLabel(state.day);
  $("#dayDate").textContent = formatDateFull(state.day);

  const people = await DB.listPeople("");
  const peopleMap = new Map(people.map(p => [p.id, p]));

  const tasks = await DB.listTasksByDate(state.day);
  const appts = await DB.listAppts(state.day);

  for (const b of ["must","money","extra"]){
    const listEl = $("#list-"+b);
    listEl.innerHTML = "";
    const items = tasks.filter(t => t.bucket===b);
    if(!items.length){
      listEl.innerHTML = `<div class="muted smallText">Vazio. Clique em “+ adicionar”.</div>`;
      continue;
    }
    for (const t of items) listEl.appendChild(taskRow(t, peopleMap));
  }

  const {now, next} = suggestNowNext(tasks, appts);
  $("#nowBox").innerHTML = now ? heroItem(now, peopleMap) : `<div class="muted">Defina 1 item essencial com <b>+ Rápido</b>.</div>`;
  $("#nextBox").innerHTML = next ? heroItem(next, peopleMap) : `<div class="muted">Depois, coloque 1 item que gere dinheiro. Pronto.</div>`;

  const apptList = $("#apptList");
  apptList.innerHTML = "";
  if(!appts.length){
    apptList.innerHTML = `<div class="muted smallText">Sem compromissos. Clique em “+ compromisso”.</div>`;
  } else {
    for(const a of appts) apptList.appendChild(apptRow(a, peopleMap));
  }
}

async function renderPeople(){
  const q = $("#peopleSearch").value || "";
  const people = await DB.listPeople(q);
  const list = $("#peopleList");
  list.innerHTML = "";

  if(!people.length){
    list.innerHTML = `<div class="muted smallText">Nenhuma pessoa cadastrada. Clique em “+ pessoa”.</div>`;
    $("#personPanel").style.display="none";
    return;
  }

  for (const p of people){
    const el = document.createElement("div");
    el.className="item";
    el.innerHTML = `
      <div class="itemLeft">
        <div class="itemTitle">${escapeHtml(p.name)}</div>
        <div class="itemMeta">${escapeHtml(p.phone||"")}</div>
      </div>
      <div class="row gap">
        <button class="btn small" data-act="open">Abrir</button>
        <button class="btn small ghost" data-act="edit">Editar</button>
      </div>
    `;
    el.querySelector('[data-act="open"]').onclick = async () => {
      state.selectedPersonId = p.id;
      await renderPersonPanel();
      $("#personPanel").scrollIntoView({behavior:"smooth", block:"start"});
    };
    el.querySelector('[data-act="edit"]').onclick = () => openEditor({kind:"person", item:p});
    list.appendChild(el);
  }
}

async function buildPersonTimeline(personId){
  const person = await DB.getPerson(personId);
  if(!person) return {person:null, items:[]};

  const payload = await DB.exportAll();
  const items = [];

  for (const t of (payload.tasks||[])){
    if(t.personId===personId){
      items.push({date:t.date, type:"Tarefa", text:`${t.bucket.toUpperCase()}: ${t.text}${t.done?" (feito)":" (pendente)"}`});
    }
  }
  for (const a of (payload.appts||[])){
    if(a.personId===personId){
      items.push({date:a.date, type:"Compromisso", text:`${a.time||"--:--"} — ${a.text} • ${a.status}`});
    }
  }
  for (const c of (payload.cash||[])){
    if(c.personId===personId){
      items.push({date:c.date, type:"Caixa", text:`${c.type==="in"?"Entrada":"Saída"} ${fmtBRL(c.value)} • ${c.category} • ${c.text}`});
    }
  }
  for (const d of (payload.docs||[])){
    if(d.personId===personId){
      items.push({date:d.date, type:"Documento", text:`${d.name}`});
    }
  }

  items.sort((a,b) => (b.date||"").localeCompare(a.date||""));
  return {person, items};
}

async function renderPersonPanel(){
  const personId = state.selectedPersonId;
  if(!personId){ $("#personPanel").style.display="none"; return; }

  const {person, items} = await buildPersonTimeline(personId);
  if(!person){ $("#personPanel").style.display="none"; return; }

  $("#personPanel").style.display="block";
  $("#personName").textContent = person.name;
  $("#personMeta").textContent = "Linha do tempo • tarefas • caixa • documentos";

  const tl = $("#personTimeline");
  tl.innerHTML = "";

  if(!items.length){
    tl.innerHTML = `<div class="muted smallText">Sem histórico ainda. Use os botões acima (+ nota, + entrada, + doc).</div>`;
    return;
  }

  for (const it of items.slice(0, 200)){
    const div = document.createElement("div");
    div.className="tItem";
    div.innerHTML = `
      <div class="tHead">
        <div class="tDate">${escapeHtml(it.date)} • ${escapeHtml(it.type)}</div>
      </div>
      <div class="muted">${escapeHtml(it.text)}</div>
    `;
    tl.appendChild(div);
  }
}

async function renderCash(){
  const range = $("#cashRange").value;
  const today = state.day;
  let from = today, to = today;

  if(range==="7"){
    from = DB.ymd(new Date(new Date(today+"T12:00:00").getTime() - 6*86400000));
    to = today;
  } else if(range==="30"){
    from = DB.ymd(new Date(new Date(today+"T12:00:00").getTime() - 29*86400000));
    to = today;
  } else if(range==="custom"){
    from = $("#cashFrom").value || today;
    to = $("#cashTo").value || today;
  }

  const people = await DB.listPeople("");
  const peopleMap = new Map(people.map(p => [p.id,p]));

  const items = await DB.listCashByRange(from, to);
  let totalIn=0,totalOut=0;
  for (const c of items){
    if(c.type==="in") totalIn += Number(c.value||0);
    else totalOut += Number(c.value||0);
  }

  $("#kpiIn").textContent = fmtBRL(totalIn);
  $("#kpiOut").textContent = fmtBRL(totalOut);
  $("#kpiBalance").textContent = fmtBRL(totalIn-totalOut);

  const list = $("#cashList");
  list.innerHTML = "";
  if(!items.length){
    list.innerHTML = `<div class="muted smallText">Nenhum lançamento no período. Clique em “+ lançar”.</div>`;
    return;
  }

  for(const c of items){
    const who = c.personId ? (peopleMap.get(c.personId)?.name || "") : "";
    const pill = c.type==="in" ? "green" : "red";
    const el = document.createElement("div");
    el.className="item";
    el.innerHTML = `
      <div class="itemLeft">
        <div class="itemTitle">${escapeHtml(c.text || "(sem descrição)")}</div>
        <div class="itemMeta">${escapeHtml(c.date)} • ${escapeHtml(c.category||"")} ${who ? " • "+escapeHtml(who):""}</div>
      </div>
      <div class="row gap">
        <span class="pill ${pill}">${c.type==="in" ? "Entrada" : "Saída"}</span>
        <span class="pill ${pill}">${fmtBRL(c.value)}</span>
        <button class="btn small" data-act="edit">Editar</button>
      </div>
    `;
    el.querySelector('[data-act="edit"]').onclick = () => openEditor({kind:"cash", item:c});
    list.appendChild(el);
  }
}

async function renderDocs(){
  const q = $("#docsSearch").value || "";
  const people = await DB.listPeople("");
  const peopleMap = new Map(people.map(p => [p.id,p]));

  const docs = await DB.listDocs(q);
  const list = $("#docsList");
  list.innerHTML = "";

  if(!docs.length){
    list.innerHTML = `<div class="muted smallText">Sem documentos. Clique em “+ documento”.</div>`;
    return;
  }

  for (const d of docs){
    const who = d.personId ? (peopleMap.get(d.personId)?.name || "") : "";
    const el = document.createElement("div");
    el.className="item";
    el.innerHTML = `
      <div class="itemLeft">
        <div class="itemTitle">${escapeHtml(d.name)}</div>
        <div class="itemMeta">${escapeHtml(d.date)} ${who ? " • "+escapeHtml(who):""} • ${(d.size||0)} bytes</div>
      </div>
      <div class="row gap">
        <button class="btn small ghost" data-act="dl">Baixar</button>
        <button class="btn small ghost" data-act="del">Excluir</button>
      </div>
    `;
    el.querySelector('[data-act="dl"]').onclick = async () => {
      const full = await DB.getDoc(d.id);
      if(!full?.blob){ alert("Arquivo não encontrado."); return; }
      const url = URL.createObjectURL(full.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = full.name || "documento";
      a.click();
      setTimeout(()=>URL.revokeObjectURL(url), 2000);
    };
    el.querySelector('[data-act="del"]').onclick = async () => {
      if(confirm("Excluir este documento?")){
        await DB.deleteDoc(d.id);
        await renderDocs();
      }
    };
    list.appendChild(el);
  }
}

let editCtx = null;

async function openEditor(ctx){
  editCtx = ctx;
  await refreshPersonSelect();

  $("#btnDelete").style.display = "none";
  $("#moneyRow").style.display = "none";
  $("#fTimeWrap").style.display = "none";
  $("#docWrap").style.display = "none";
  $("#fText").value = "";
  $("#fTime").value = "";
  $("#fValue").value = "";
  $("#fCashType").value = "in";
  $("#fCategory").value = "Atendimento";
  $("#fPerson").value = "";

  const today = state.day;
  $("#fDate").value = (ctx.item?.date || today);

  if(ctx.kind==="task"){
    $("#editTitle").textContent = ctx.item ? "Editar tarefa" : "Nova tarefa";
    $("#editSubtitle").textContent = "objetiva: verbo + ação + fim claro";
    $("#fText").value = ctx.item?.text || "";
    $("#fPerson").value = ctx.item?.personId || "";
    $("#btnDelete").style.display = ctx.item ? "inline-flex" : "none";
  }

  if(ctx.kind==="appt"){
    $("#editTitle").textContent = ctx.item ? "Editar compromisso" : "Novo compromisso";
    $("#editSubtitle").textContent = "adicione hora se tiver";
    $("#fText").value = ctx.item?.text || "";
    $("#fTimeWrap").style.display = "block";
    $("#fTime").value = ctx.item?.time || "";
    $("#fPerson").value = ctx.item?.personId || "";
    $("#btnDelete").style.display = ctx.item ? "inline-flex" : "none";
  }

  if(ctx.kind==="cash"){
    $("#editTitle").textContent = ctx.item ? "Editar lançamento" : "Novo lançamento";
    $("#editSubtitle").textContent = "entrada/saída com valor";
    $("#moneyRow").style.display = "flex";
    $("#fText").value = ctx.item?.text || "";
    $("#fValue").value = (ctx.item?.value ?? "");
    $("#fCashType").value = ctx.item?.type || "in";
    $("#fCategory").value = ctx.item?.category || "Atendimento";
    $("#fPerson").value = ctx.item?.personId || "";
    $("#btnDelete").style.display = ctx.item ? "inline-flex" : "none";
  }

  if(ctx.kind==="doc"){
    $("#editTitle").textContent = "Adicionar documento";
    $("#editSubtitle").textContent = "o arquivo fica salvo no aparelho (offline)";
    $("#docWrap").style.display = "block";
    $("#fPerson").value = ctx.item?.personId || "";
  }

  if(ctx.kind==="person"){
    $("#editTitle").textContent = ctx.item ? "Editar pessoa" : "Nova pessoa";
    $("#editSubtitle").textContent = "nome é o essencial";
    $("#fText").value = ctx.item?.name || "";
    $("#btnDelete").style.display = ctx.item ? "inline-flex" : "none";
  }

  if(ctx.kind==="note"){
    $("#editTitle").textContent = "Nota rápida";
    $("#editSubtitle").textContent = "vira evento na linha do tempo";
    $("#fPerson").value = ctx.personId || "";
  }

  openModal("modalEdit");
}

async function handleSave(e){
  e.preventDefault();
  if(!editCtx) return;

  const date = $("#fDate").value || state.day;
  const text = ($("#fText").value || "").trim();
  const personId = $("#fPerson").value || null;

  if(editCtx.kind==="task"){
    if(!text){ alert("Coloque um texto objetivo."); return; }
    const item = editCtx.item || {bucket: editCtx.bucket, date};
    await DB.upsertTask({...item, date, text, personId});
    closeModal("modalEdit");
    await renderToday();
  }

  if(editCtx.kind==="appt"){
    if(!text){ alert("Descreva o compromisso."); return; }
    const time = $("#fTime").value || "";
    const item = editCtx.item || {date};
    await DB.upsertAppt({...item, date, time, text, personId});
    closeModal("modalEdit");
    await renderToday();
  }

  if(editCtx.kind==="cash"){
    const val = Number($("#fValue").value || 0);
    if(!val){ alert("Informe um valor."); return; }
    const type = $("#fCashType").value || "in";
    const category = $("#fCategory").value || "Outros";
    const item = editCtx.item || {date};
    await DB.upsertCash({...item, date, type, category, text, value: val, personId});
    closeModal("modalEdit");
    await renderCash();
    if(state.selectedPersonId) await renderPersonPanel();
  }

  if(editCtx.kind==="doc"){
    const f = $("#fFile").files[0];
    if(!f){ alert("Selecione um arquivo."); return; }
    await DB.addDoc({date, name: f.name, mime: f.type, size: f.size, personId, blob: f});
    closeModal("modalEdit");
    await renderDocs();
    if(state.selectedPersonId) await renderPersonPanel();
  }

  if(editCtx.kind==="person"){
    if(!text){ alert("Nome é obrigatório."); return; }
    const p = editCtx.item || {};
    await DB.upsertPerson({ ...p, name:text });
    closeModal("modalEdit");
    await renderPeople();
    if(state.selectedPersonId) await renderPersonPanel();
  }

  if(editCtx.kind==="note"){
    if(!text){ alert("Escreva uma nota curta."); return; }
    await DB.upsertTask({date, bucket:"extra", text:`[NOTA] ${text}`, done:true, personId});
    closeModal("modalEdit");
    if(state.selectedPersonId) await renderPersonPanel();
    await renderToday();
  }
}

async function handleDelete(){
  if(!editCtx?.item) return closeModal("modalEdit");
  if(!confirm("Excluir este item?")) return;

  const id = editCtx.item.id;
  if(editCtx.kind==="task") await DB.deleteTask(id);
  if(editCtx.kind==="appt") await DB.deleteAppt(id);
  if(editCtx.kind==="cash") await DB.deleteCash(id);
  if(editCtx.kind==="person") await DB.deletePerson(id);

  closeModal("modalEdit");
  await renderAll();
}

async function setupEvents(){
  $$(".tab").forEach(b => b.addEventListener("click", async () => {
    switchView(b.dataset.view);
    await renderAll();
  }));

  $("#prevDay").onclick = async () => {
    state.day = DB.ymd(new Date(new Date(state.day+"T12:00:00").getTime()-86400000));
    await renderAll();
  };
  $("#nextDay").onclick = async () => {
    state.day = DB.ymd(new Date(new Date(state.day+"T12:00:00").getTime()+86400000));
    await renderAll();
  };

  $$('[data-add]').forEach(btn => btn.addEventListener("click", () => {
    openEditor({kind:"task", bucket: btn.dataset.add, item:null});
  }));

  $("#btnAddAppt").onclick = () => openEditor({kind:"appt", item:null});
  $("#btnAddPerson").onclick = () => openEditor({kind:"person", item:null});
  $("#btnAddCash").onclick = () => openEditor({kind:"cash", item:null});
  $("#btnAddDoc").onclick = () => openEditor({kind:"doc", item:null});

  $("#btnQuick").onclick = () => openModal("modalQuick");
  $("#btnHelp").onclick = () => openModal("modalHelp");
  $("#btnBackup").onclick = () => openModal("modalBackup");

  $("#btnTodayPDF").onclick = async () => {
    const people = await DB.listPeople("");
    const peopleMap = new Map(people.map(p => [p.id,p]));
    const tasks = await DB.listTasksByDate(state.day);
    const appts = await DB.listAppts(state.day);
    const tasksByBucket = {
      must: tasks.filter(t=>t.bucket==="must"),
      money: tasks.filter(t=>t.bucket==="money"),
      extra: tasks.filter(t=>t.bucket==="extra"),
    };
    await pdfAgendaDia(state.day, tasksByBucket, appts, peopleMap);
  };

  $("#btnCashPDF").onclick = async () => {
    const range = $("#cashRange").value;
    const today = state.day;
    let from=today,to=today;
    if(range==="7"){ from = DB.ymd(new Date(new Date(today+"T12:00:00").getTime() - 6*86400000)); to=today; }
    else if(range==="30"){ from = DB.ymd(new Date(new Date(today+"T12:00:00").getTime() - 29*86400000)); to=today; }
    else if(range==="custom"){ from = $("#cashFrom").value || today; to = $("#cashTo").value || today; }

    const people = await DB.listPeople("");
    const peopleMap = new Map(people.map(p => [p.id,p]));
    const items = await DB.listCashByRange(from, to);
    await pdfCaixa(from, to, items, peopleMap);
  };

  $("#btnPersonPDF").onclick = async () => {
    if(!state.selectedPersonId) return alert("Abra uma pessoa primeiro.");
    const {person, items} = await buildPersonTimeline(state.selectedPersonId);
    if(person) await pdfPessoa(person, items);
  };

  $("#btnPDF").onclick = () => {
    if(state.view==="today") $("#btnTodayPDF").click();
    else if(state.view==="cash") $("#btnCashPDF").click();
    else if(state.view==="people") $("#btnPersonPDF").click();
    else alert("Use PDF no Hoje/Caixa/Pessoa.");
  };

  $("#cashRange").onchange = async () => {
    const isCustom = $("#cashRange").value==="custom";
    $("#cashFrom").style.display = isCustom ? "block" : "none";
    $("#cashTo").style.display = isCustom ? "block" : "none";
    await renderCash();
  };
  $("#cashFrom").onchange = renderCash;
  $("#cashTo").onchange = renderCash;

  $("#peopleSearch").oninput = renderPeople;
  $("#btnClearPeopleSearch").onclick = async () => { $("#peopleSearch").value=""; await renderPeople(); };
  $("#docsSearch").oninput = renderDocs;
  $("#btnClearDocsSearch").onclick = async () => { $("#docsSearch").value=""; await renderDocs(); };

  $$("[data-quick]").forEach(b => b.onclick = () => {
    const q = b.dataset.quick;
    closeModal("modalQuick");
    if(q==="must") openEditor({kind:"task", bucket:"must", item:null});
    if(q==="money") openEditor({kind:"task", bucket:"money", item:null});
    if(q==="extra") openEditor({kind:"task", bucket:"extra", item:null});
    if(q==="appt") openEditor({kind:"appt", item:null});
    if(q==="in") openEditor({kind:"cash", item:{date: state.day, type:"in", category:"Atendimento", text:"", value:"", personId:null}});
    if(q==="out") openEditor({kind:"cash", item:{date: state.day, type:"out", category:"Material", text:"", value:"", personId:null}});
    if(q==="doc") openEditor({kind:"doc", item:{date: state.day, personId:null}});
    if(q==="person") openEditor({kind:"person", item:null});
  });

  $$("[data-close]").forEach(b => b.onclick = () => closeModal(b.dataset.close));

  $("#editForm").addEventListener("submit", handleSave);
  $("#btnDelete").onclick = handleDelete;

  $("#btnPersonAddNote").onclick = () => {
    if(!state.selectedPersonId) return;
    openEditor({kind:"note", personId: state.selectedPersonId});
  };
  $("#btnPersonAddIn").onclick = () => {
    if(!state.selectedPersonId) return;
    openEditor({kind:"cash", item:{date: state.day, type:"in", category:"Atendimento", text:"", value:"", personId: state.selectedPersonId}});
  };
  $("#btnPersonAddOut").onclick = () => {
    if(!state.selectedPersonId) return;
    openEditor({kind:"cash", item:{date: state.day, type:"out", category:"Material", text:"", value:"", personId: state.selectedPersonId}});
  };
  $("#btnPersonAttach").onclick = () => {
    if(!state.selectedPersonId) return;
    openEditor({kind:"doc", item:{date: state.day, personId: state.selectedPersonId}});
  };

  $("#btnExport").onclick = async () => {
    const payload = await DB.exportAll();
    const blob = new Blob([JSON.stringify(payload)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `BTX_Backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(url), 1500);
  };

  $("#backupFile").onchange = async (e) => {
    const f = e.target.files[0];
    if(!f) return;
    try{
      const text = await f.text();
      const payload = JSON.parse(text);
      if(!confirm("Importar este backup? Isso substitui os dados atuais.")) return;
      await DB.importAll(payload);
      alert("Backup importado com sucesso.");
      closeModal("modalBackup");
      await renderAll();
    } catch(err){
      console.error(err);
      alert("Arquivo inválido.");
    } finally {
      $("#backupFile").value = "";
    }
  };

  // First run: ajuda + seed
  const first = await DB.getMeta("firstRunDone");
  if(!first){
    await DB.setMeta("firstRunDone", "yes");
    openModal("modalHelp");
    await DB.upsertTask({date: state.day, bucket:"must", text:"Pagar conta (2 min)", done:false, personId:null});
    await DB.upsertTask({date: state.day, bucket:"money", text:"Confirmar 1 paciente no WhatsApp", done:false, personId:null});
    await DB.upsertAppt({date: state.day, time:"09:00", text:"Atendimento (exemplo)", status:"pendente", personId:null});
  }

  // PWA offline
  if("serviceWorker" in navigator){
    try{ await navigator.serviceWorker.register("./sw.js"); }catch(e){ console.warn("SW fail", e); }
  }
}

async function renderAll(){
  await refreshPersonSelect();
  if(state.view==="today") await renderToday();
  if(state.view==="people") { await renderPeople(); if(state.selectedPersonId) await renderPersonPanel(); }
  if(state.view==="cash") await renderCash();
  if(state.view==="docs") await renderDocs();
}

window.addEventListener("DOMContentLoaded", async () => {
  await setupEvents();
  await renderAll();
});
