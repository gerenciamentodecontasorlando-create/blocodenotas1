/* =========================================================
   BTX FLOW • DB
   IndexedDB – memória longitudinal offline-first
   ========================================================= */

const DB_NAME = "btx_flow_tdah_v3";
const DB_VERSION = 1;

function uid(){
  if (crypto?.randomUUID) return crypto.randomUUID();
  return "id-" + Math.random().toString(16).slice(2) + "-" + Date.now();
}
function nowISO(){ return new Date().toISOString(); }
function ymd(d){
  const x = (d instanceof Date) ? d : new Date(d);
  const yyyy = x.getFullYear();
  const mm = String(x.getMonth()+1).padStart(2,'0');
  const dd = String(x.getDate()).padStart(2,'0');
  return `${yyyy}-${mm}-${dd}`;
}

let _dbPromise = null;

function openDB(){
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;

      // meta
      const meta = db.createObjectStore("meta", { keyPath: "key" });

      // tarefas
      const tasks = db.createObjectStore("tasks", { keyPath: "id" });
      tasks.createIndex("by_date", "date", { unique:false });
      tasks.createIndex("by_bucket_date", ["bucket","date"], { unique:false });
      tasks.createIndex("by_person", "personId", { unique:false });

      // compromissos
      const appts = db.createObjectStore("appts", { keyPath: "id" });
      appts.createIndex("by_date", "date", { unique:false });
      appts.createIndex("by_person", "personId", { unique:false });

      // pessoas
      const people = db.createObjectStore("people", { keyPath: "id" });
      people.createIndex("by_name", "name", { unique:false });

      // dinheiro
      const cash = db.createObjectStore("cash", { keyPath: "id" });
      cash.createIndex("by_date", "date", { unique:false });
      cash.createIndex("by_person", "personId", { unique:false });

      // arquivos
      const docs = db.createObjectStore("docs", { keyPath: "id" });
      docs.createIndex("by_date", "date", { unique:false });
      docs.createIndex("by_person", "personId", { unique:false });
      docs.createIndex("by_related", ["relatedType","relatedId"], { unique:false });

      meta.put({ key:"createdAt", value: nowISO() });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

async function tx(storeNames, mode, fn){
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeNames, mode);
    const stores = {};
    storeNames.forEach(n => stores[n] = t.objectStore(n));
    let result;
    Promise.resolve().then(() => fn(stores))
      .then(r => { result = r; })
      .catch(err => reject(err));
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
  });
}

function reqToPromise(req){
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function getAll(store){
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}
function getAllFromIndex(index, range){
  return new Promise((resolve, reject) => {
    const req = index.getAll(range);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}
function clearStore(store){
  return new Promise((resolve, reject) => {
    const req = store.clear();
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

/* ===== Helpers para arquivos ===== */
function blobToBase64(blob){
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.readAsDataURL(blob);
  });
}
function base64ToBlob(dataUrl, mime){
  const parts = dataUrl.split(",");
  const b64 = parts[1] || "";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
  return new Blob([arr], {
    type: mime || (parts[0].match(/data:(.*?);base64/)||[])[1] || "application/octet-stream"
  });
}

/* =========================================================
   API pública
   ========================================================= */
const DB = {
  uid, nowISO, ymd,

  /* META */
  async getMeta(key){
    return tx(["meta"], "readonly", async ({meta}) => {
      const r = await reqToPromise(meta.get(key));
      return r?.value ?? null;
    });
  },
  async setMeta(key, value){
    return tx(["meta"], "readwrite", async ({meta}) => meta.put({key, value}));
  },

  /* PESSOAS */
  async listPeople(query=""){
    query = (query||"").trim().toLowerCase();
    return tx(["people"], "readonly", async ({people}) => {
      const all = await getAll(people);
      const filtered = query ? all.filter(p => (p.name||"").toLowerCase().includes(query)) : all;
      filtered.sort((a,b) => (a.name||"").localeCompare(b.name||""));
      return filtered;
    });
  },
  async upsertPerson(p){
    const obj = {
      id: p.id || uid(),
      name: (p.name||"").trim(),
      phone: (p.phone||"").trim(),
      notes: (p.notes||"").trim(),
      createdAt: p.createdAt || nowISO(),
      updatedAt: nowISO(),
    };
    return tx(["people"], "readwrite", async ({people}) => {
      await reqToPromise(people.put(obj));
      return obj;
    });
  },
  async getPerson(id){
    return tx(["people"], "readonly", async ({people}) => reqToPromise(people.get(id)));
  },
  async deletePerson(id){
    return tx(["people","tasks","appts","cash","docs"], "readwrite",
      async ({people,tasks,appts,cash,docs}) => {
        await reqToPromise(people.delete(id));
        const [ts, ap, cs, ds] = await Promise.all([
          getAll(tasks), getAll(appts), getAll(cash), getAll(docs)
        ]);
        for (const t of ts){
          if(t.personId===id){ t.personId=null; t.updatedAt=nowISO(); await reqToPromise(tasks.put(t)); }
        }
        for (const a of ap){
          if(a.personId===id){ a.personId=null; a.updatedAt=nowISO(); await reqToPromise(appts.put(a)); }
        }
        for (const c of cs){
          if(c.personId===id){ c.personId=null; c.updatedAt=nowISO(); await reqToPromise(cash.put(c)); }
        }
        for (const d of ds){
          if(d.personId===id){ d.personId=null; await reqToPromise(docs.put(d)); }
        }
      }
    );
  },

  /* TAREFAS */
  async listTasksByDate(date){
    return tx(["tasks"], "readonly", async ({tasks}) => {
      const idx = tasks.index("by_date");
      const items = await getAllFromIndex(idx, IDBKeyRange.only(date));
      items.sort((a,b) => (a.bucket||"").localeCompare(b.bucket||"") ||
                          (a.createdAt||"").localeCompare(b.createdAt||""));
      return items;
    });
  },
  async upsertTask(t){
    const obj = {
      id: t.id || uid(),
      date: t.date,
      bucket: t.bucket, // must | money | extra
      text: (t.text||"").trim(),
      done: !!t.done,
      personId: t.personId || null,
      createdAt: t.createdAt || nowISO(),
      updatedAt: nowISO(),
    };
    return tx(["tasks"], "readwrite", async ({tasks}) => {
      await reqToPromise(tasks.put(obj));
      return obj;
    });
  },
  async deleteTask(id){
    return tx(["tasks"], "readwrite", async ({tasks}) => reqToPromise(tasks.delete(id)));
  },

  /* COMPROMISSOS */
  async listAppts(date){
    return tx(["appts"], "readonly", async ({appts}) => {
      const idx = appts.index("by_date");
      const items = await getAllFromIndex(idx, IDBKeyRange.only(date));
      items.sort((a,b) => (a.time||"").localeCompare(b.time||"") ||
                          (a.createdAt||"").localeCompare(b.createdAt||""));
      return items;
    });
  },
  async upsertAppt(a){
    const obj = {
      id: a.id || uid(),
      date: a.date,
      time: a.time || "",
      text: (a.text||"").trim(),
      status: a.status || "pendente",
      personId: a.personId || null,
      createdAt: a.createdAt || nowISO(),
      updatedAt: nowISO(),
    };
    return tx(["appts"], "readwrite", async ({appts}) => {
      await reqToPromise(appts.put(obj));
      return obj;
    });
  },
  async deleteAppt(id){
    return tx(["appts"], "readwrite", async ({appts}) => reqToPromise(appts.delete(id)));
  },

  /* DINHEIRO */
  async listCashByRange(fromYMD, toYMD){
    return tx(["cash"], "readonly", async ({cash}) => {
      const idx = cash.index("by_date");
      const items = await getAllFromIndex(idx, IDBKeyRange.bound(fromYMD, toYMD));
      items.sort((a,b) => (b.date||"").localeCompare(a.date||"") ||
                          (b.createdAt||"").localeCompare(a.createdAt||""));
      return items;
    });
  },
  async upsertCash(c){
    const obj = {
      id: c.id || uid(),
      date: c.date,
      type: c.type, // in | out
      value: Number(c.value || 0),
      category: c.category || "Outros",
      text: (c.text||"").trim(),
      personId: c.personId || null,
      createdAt: c.createdAt || nowISO(),
      updatedAt: nowISO(),
    };
    return tx(["cash"], "readwrite", async ({cash}) => {
      await reqToPromise(cash.put(obj));
      return obj;
    });
  },
  async deleteCash(id){
    return tx(["cash"], "readwrite", async ({cash}) => reqToPromise(cash.delete(id)));
  },

  /* ARQUIVOS */
  async listDocs(query=""){
    query = (query||"").trim().toLowerCase();
    return tx(["docs"], "readonly", async ({docs}) => {
      const all = await getAll(docs);
      const filtered = query ? all.filter(d => (d.name||"").toLowerCase().includes(query)) : all;
      filtered.sort((a,b) => (b.date||"").localeCompare(a.date||"") ||
                             (b.createdAt||"").localeCompare(a.createdAt||""));
      return filtered;
    });
  },
  async addDoc({date, name, mime, size, personId=null, relatedType=null, relatedId=null, blob=null}){
    const obj = {
      id: uid(),
      date,
      name,
      mime,
      size,
      personId,
      relatedType,
      relatedId,
      blob,
      createdAt: nowISO(),
    };
    return tx(["docs"], "readwrite", async ({docs}) => {
      await reqToPromise(docs.put(obj));
      return obj;
    });
  },
  async getDoc(id){
    return tx(["docs"], "readonly", async ({docs}) => reqToPromise(docs.get(id)));
  },
  async deleteDoc(id){
    return tx(["docs"], "readwrite", async ({docs}) => reqToPromise(docs.delete(id)));
  },

  /* BACKUP */
  async exportAll(){
    return tx(["meta","people","tasks","appts","cash","docs"], "readonly",
      async ({meta,people,tasks,appts,cash,docs}) => {
        const payload = {
          exportedAt: nowISO(),
          meta: await getAll(meta),
          people: await getAll(people),
          tasks: await getAll(tasks),
          appts: await getAll(appts),
          cash: await getAll(cash),
          docs: []
        };
        const allDocs = await getAll(docs);
        for (const d of allDocs){
          const b64 = d.blob ? await blobToBase64(d.blob) : null;
          payload.docs.push({ ...d, blob: b64 });
        }
        return payload;
      }
    );
  },
  async importAll(payload){
    return tx(["meta","people","tasks","appts","cash","docs"], "readwrite",
      async ({meta,people,tasks,appts,cash,docs}) => {
        await Promise.all([
          clearStore(meta), clearStore(people), clearStore(tasks),
          clearStore(appts), clearStore(cash), clearStore(docs)
        ]);
        for (const m of (payload.meta||[])) await reqToPromise(meta.put(m));
        for (const p of (payload.people||[])) await reqToPromise(people.put(p));
        for (const t of (payload.tasks||[])) await reqToPromise(tasks.put(t));
        for (const a of (payload.appts||[])) await reqToPromise(appts.put(a));
        for (const c of (payload.cash||[])) await reqToPromise(cash.put(c));
        for (const d of (payload.docs||[])){
          const blob = d.blob ? base64ToBlob(d.blob, d.mime) : null;
          await reqToPromise(docs.put({ ...d, blob }));
        }
        await reqToPromise(meta.put({key:"importedAt", value: nowISO()}));
      }
    );
  }
};
