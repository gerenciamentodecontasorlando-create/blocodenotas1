/* =========================================================
   BTX FLOW • pdf.js
   PDF COMPLETO • SEM QUEBRAR • SEM BLOQUEAR BOTAO
   ========================================================= */

(function () {
  const { jsPDF } = window.jspdf;

  if (!jsPDF) {
    alert("Erro: jsPDF não carregado.");
    return;
  }

  /* ---------- util ---------- */
  function fmtBRL(v) {
    const n = Number(v || 0);
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function formatDateBR(ymd) {
    if (!ymd) return "";
    const [y, m, d] = ymd.split("-");
    return `${d}/${m}/${y}`;
  }

  function ensureMap(obj) {
    if (obj instanceof Map) return obj;
    const m = new Map();
    Object.keys(obj || {}).forEach(k => m.set(k, obj[k]));
    return m;
  }

  function drawFrame(doc, margin) {
    const W = 210, H = 297;
    doc.setDrawColor(33, 69, 103);
    doc.setLineWidth(0.6);
    doc.roundedRect(margin, margin, W - margin * 2, H - margin * 2, 4, 4);
  }

  function newPage(doc, margin) {
    doc.addPage();
    drawFrame(doc, margin);
    return margin + 14;
  }

  /* =========================================================
     PDF DO DIA
     ========================================================= */
  async function pdfToday({ date, tasksByBucket, appts, peopleIndex }) {
    const peopleMap = ensureMap(peopleIndex);
    const doc = new jsPDF({ unit: "mm", format: "a4" });

    const W = 210, H = 297;
    const margin = 12;
    const innerW = W - margin * 2;

    drawFrame(doc, margin);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("AGENDA DO DIA", W / 2, margin + 10, { align: "center" });

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 120, 160);
    doc.text(`Data: ${formatDateBR(date)}`, W / 2, margin + 16, { align: "center" });
    doc.setTextColor(0, 0, 0);

    let y = margin + 26;

    function section(title, color) {
      if (y > H - margin - 20) y = newPage(doc, margin);
      doc.setFillColor(...color);
      doc.roundedRect(margin + 2, y, innerW - 4, 8, 2, 2, "F");
      doc.setTextColor(255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(title, margin + 6, y + 5.6);
      doc.setTextColor(0);
      y += 12;
    }

    function item(text) {
      const lines = doc.splitTextToSize(text, innerW - 14);
      for (const ln of lines) {
        if (y > H - margin - 10) y = newPage(doc, margin);
        doc.circle(margin + 6, y - 1.5, 1.2, "S");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(ln, margin + 10, y);
        y += 5;
      }
    }

    const blocks = [
      { k: "must", title: "NÃO POSSO FALHAR", color: [255, 91, 110] },
      { k: "money", title: "GERA DINHEIRO", color: [41, 209, 125] },
      { k: "extra", title: "SE SOBRAR TEMPO", color: [64, 156, 255] }
    ];

    for (const b of blocks) {
      const list = tasksByBucket[b.k] || [];
      if (!list.length) continue;
      section(b.title, b.color);
      list.forEach(t => {
        const who = t.personId ? peopleMap.get(t.personId)?.name : "";
        const done = t.done ? " (feito)" : "";
        item(`${t.text}${who ? " • " + who : ""}${done}`);
      });
      y += 2;
    }

    section("COMPROMISSOS", [120, 160, 200]);
    if (!appts || !appts.length) {
      item("Sem compromissos cadastrados.");
    } else {
      appts.forEach(a => {
        const who = a.personId ? peopleMap.get(a.personId)?.name : "";
        const st = a.status ? ` (${a.status})` : "";
        item(`${a.time || "--:--"} — ${a.text}${who ? " • " + who : ""}${st}`);
      });
    }

    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text("BTX Agenda TDAH • PDF automático", W / 2, H - margin + 6, { align: "center" });

    doc.save(`Agenda_${date}.pdf`);
  }

  /* =========================================================
     PDF CAIXA
     ========================================================= */
  async function pdfCash({ from, to, items, peopleIndex }) {
    const peopleMap = ensureMap(peopleIndex);
    const doc = new jsPDF({ unit: "mm", format: "a4" });

    const W = 210, H = 297;
    const margin = 12;
    const innerW = W - margin * 2;

    drawFrame(doc, margin);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("RELATÓRIO DE CAIXA", W / 2, margin + 10, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(80, 120, 160);
    doc.text(`Período: ${formatDateBR(from)} a ${formatDateBR(to)}`, W / 2, margin + 16, { align: "center" });
    doc.setTextColor(0);

    let totalIn = 0, totalOut = 0;
    items.forEach(c => c.type === "in" ? totalIn += +c.value : totalOut += +c.value);

    let y = margin + 26;

    doc.setFillColor(16, 43, 71);
    doc.roundedRect(margin + 2, y, innerW - 4, 16, 2, 2, "F");
    doc.setTextColor(255);
    doc.setFontSize(10);
    doc.text(`Entradas: ${fmtBRL(totalIn)}`, margin + 6, y + 7);
    doc.text(`Saídas: ${fmtBRL(totalOut)}`, margin + 6, y + 12);
    doc.text(`Saldo: ${fmtBRL(totalIn - totalOut)}`, margin + 110, y + 10);
    doc.setTextColor(0);
    y += 22;

    doc.setFontSize(9);
    items.forEach(c => {
      if (y > H - margin - 12) y = newPage(doc, margin);
      const who = c.personId ? peopleMap.get(c.personId)?.name : "";
      const desc = `${c.text}${who ? " • " + who : ""}`;
      doc.text(formatDateBR(c.date), margin + 6, y);
      doc.text(c.type === "in" ? "Entrada" : "Saída", margin + 28, y);
      doc.text(fmtBRL(c.value), margin + 52, y);
      const lines = doc.splitTextToSize(desc, innerW - 70);
      doc.text(lines, margin + 80, y);
      y += Math.max(6, lines.length * 4.5);
    });

    doc.save(`Caixa_${from}_a_${to}.pdf`);
  }

  /* =========================================================
     PDF PESSOA
     ========================================================= */
  async function pdfPerson({ person, timeline }) {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const W = 210, H = 297;
    const margin = 12;
    const innerW = W - margin * 2;

    drawFrame(doc, margin);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("EXTRATO DA PESSOA", W / 2, margin + 10, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(80, 120, 160);
    doc.text(`Pessoa: ${person.name}`, W / 2, margin + 16, { align: "center" });
    doc.setTextColor(0);

    let y = margin + 26;

    timeline.forEach(it => {
      if (y > H - margin - 12) y = newPage(doc, margin);
      doc.setFont("helvetica", "bold");
      doc.text(`${formatDateBR(it.date)} • ${it.type}`, margin + 6, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      const lines = doc.splitTextToSize(it.text || "", innerW - 10);
      doc.text(lines, margin + 10, y);
      y += lines.length * 4.5 + 3;
    });

    doc.save(`Pessoa_${person.name.replace(/\s+/g, "_")}.pdf`);
  }

  /* =========================================================
     EXPORT GLOBAL (BOTAO PDF NUNCA TRAVA)
     ========================================================= */
  window.BTXPDF = {
    fmtBRL,
    pdfToday,
    pdfCash,
    pdfPerson
  };

})();
