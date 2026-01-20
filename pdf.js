/* =========================================================
   BTX FLOW • pdf.js (COMPLETO)
   - PDF do dia com: tarefas + compromissos
   - Paginação automática sem quebrar margem/borda
   - PDF do dinheiro com paginação
   ========================================================= */

(function () {
  const { jsPDF } = window.jspdf || {};

  const BTXPDF = {
    fmtBRL(v){
      const n = Number(v || 0);
      return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    },

    _ensureJsPDF(){
      if (!jsPDF) throw new Error("jsPDF não carregou. Verifique o script CDN no index.html.");
    },

    _page(doc){
      // A4 em mm
      const w = doc.internal.pageSize.getWidth();
      const h = doc.internal.pageSize.getHeight();
      return { w, h };
    },

    _drawFrame(doc, opts = {}){
      const { w, h } = this._page(doc);
      const m = opts.margin ?? 10;
      const r = opts.radius ?? 4;

      doc.setDrawColor(33, 69, 103);
      doc.setLineWidth(0.8);

      // roundedRect existe na maioria das builds do jsPDF 2.x
      if (typeof doc.roundedRect === "function") {
        doc.roundedRect(m, m, w - m * 2, h - m * 2, r, r, "S");
      } else {
        doc.rect(m, m, w - m * 2, h - m * 2, "S");
      }

      // rodapé discreto
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(140);
      doc.text("BTX Agenda TDAH • PDF enquadrado com borda", w / 2, h - (m - 3), { align: "center" });
      doc.setTextColor(0);
    },

    _drawHeader(doc, dateStr){
      const { w } = this._page(doc);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("AGENDA DO DIA", w / 2, 22, { align: "center" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(80);
      doc.text(`Data: ${dateStr}`, w / 2, 28, { align: "center" });
      doc.setTextColor(0);
    },

    _sectionTitle(doc, x, y, w, label, rgb){
      doc.setFillColor(rgb[0], rgb[1], rgb[2]);
      doc.setDrawColor(0);
      doc.setLineWidth(0);
      doc.roundedRect ? doc.roundedRect(x, y, w, 9, 2, 2, "F") : doc.rect(x, y, w, 9, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(255, 255, 255);
      doc.text(label, x + 4, y + 6.3);
      doc.setTextColor(0);
    },

    _checkbox(doc, x, y){
      // círculo vazado tipo checklist
      doc.setDrawColor(0);
      doc.setLineWidth(0.4);
      doc.circle(x, y, 1.4, "S");
    },

    _wrapLines(doc, text, maxWidth){
      const t = String(text || "").trim();
      if (!t) return [""];
      return doc.splitTextToSize(t, maxWidth);
    },

    _pageBreakIfNeeded(ctx, needed = 6){
      // se não couber, cria nova página, redesenha borda e (opcional) header pequeno
      const { doc, margin, pageH } = ctx;
      const bottomLimit = pageH - margin - 12; // reserva rodapé

      if (ctx.y + needed > bottomLimit) {
        doc.addPage();
        this._drawFrame(doc, { margin });
        // header compacto na página 2+ (mantém contexto sem gastar espaço)
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text("AGENDA DO DIA", margin + 2, margin + 10);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(90);
        doc.text(`Data: ${ctx.dateStr}`, margin + 2, margin + 15);
        doc.setTextColor(0);
        ctx.y = margin + 22;
      }
    },

    _renderChecklistBlock(ctx, items, emptyText){
      const { doc, margin, pageW } = ctx;
      const left = margin + 6;
      const maxTextW = pageW - margin - left - 6;

      if (!items || !items.length) {
        this._pageBreakIfNeeded(ctx, 7);
        this._checkbox(doc, left, ctx.y + 1.5);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(emptyText || "Sem itens cadastrados.", left + 5, ctx.y + 2.6);
        ctx.y += 7;
        return;
      }

      for (const it of items) {
        const text = typeof it === "string" ? it : (it.text || "");
        const lines = this._wrapLines(doc, text, maxTextW);

        // altura estimada: linhas * 5 + 3
        const need = (lines.length * 5) + 3;
        this._pageBreakIfNeeded(ctx, need);

        this._checkbox(doc, left, ctx.y + 1.6);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        // desenha linhas
        for (let i = 0; i < lines.length; i++) {
          doc.text(lines[i], left + 5, ctx.y + 2.6 + (i * 5));
        }
        ctx.y += (lines.length * 5) + 2;
      }

      ctx.y += 3;
    },

    async pdfToday({ date, tasksByBucket, appts, peopleIndex }){
      this._ensureJsPDF();

      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const { w: pageW, h: pageH } = this._page(doc);
      const margin = 10;

      const dateStr = (date || "").split("-").reverse().join("/");

      // moldura + cabeçalho
      this._drawFrame(doc, { margin });
      this._drawHeader(doc, dateStr);

      const ctx = { doc, pageW, pageH, margin, y: 38, dateStr };

      // bloco helper
      const block = (label, rgb, items, emptyText) => {
        const boxW = pageW - margin * 2 - 10;
        const x = margin + 5;

        this._pageBreakIfNeeded(ctx, 16);
        this._sectionTitle(doc, x, ctx.y, boxW, label, rgb);
        ctx.y += 12;

        this._renderChecklistBlock(ctx, items, emptyText);
      };

      const must = (tasksByBucket?.must || []);
      const money = (tasksByBucket?.money || []);
      const extra = (tasksByBucket?.extra || []);

      block("NÃO POSSO FALHAR", [255, 91, 110], must, "Sem itens cadastrados.");
      block("GERA DINHEIRO", [41, 209, 125], money, "Sem itens cadastrados.");
      block("SE SOBRAR TEMPO", [64, 156, 255], extra, "Sem itens cadastrados.");

      // COMPROMISSOS (aqui é onde tava falhando)
      // Se você passa appts corretamente do app.js, isso imprime tudo.
      const apptItems = (appts || []).map(a => {
        const t = (a.time ? `${a.time} — ` : "");
        const s = a.status ? ` (${a.status})` : "";
        const who = a.personId && peopleIndex?.[a.personId]?.name ? ` • ${peopleIndex[a.personId].name}` : "";
        return `${t}${a.text || ""}${s}${who}`;
      });

      block("COMPROMISSOS", [130, 160, 190], apptItems, "Sem compromissos cadastrados.");

      doc.save(`Agenda_${dateStr}.pdf`);
    },

    async pdfCash({ title, from, to, items, totals, peopleIndex }){
      this._ensureJsPDF();

      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const { w: pageW, h: pageH } = this._page(doc);
      const margin = 10;

      const fromStr = (from || "").split("-").reverse().join("/");
      const toStr = (to || "").split("-").reverse().join("/");

      this._drawFrame(doc, { margin });
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("RELATÓRIO DE DINHEIRO", pageW / 2, 22, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(80);
      doc.text(`${title || "Período"}: ${fromStr} a ${toStr}`, pageW / 2, 28, { align: "center" });
      doc.setTextColor(0);

      let y = 38;
      const bottom = pageH - margin - 12;

      const newPage = () => {
        doc.addPage();
        this._drawFrame(doc, { margin });
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text("RELATÓRIO DE DINHEIRO", margin + 2, margin + 10);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(90);
        doc.text(`${fromStr} a ${toStr}`, margin + 2, margin + 15);
        doc.setTextColor(0);
        y = margin + 22;
      };

      // Totais
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(`Saldo: ${this.fmtBRL(totals?.balance || 0)}`, margin + 5, y);
      y += 7;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Entradas: ${this.fmtBRL(totals?.in || 0)}   •   Saídas: ${this.fmtBRL(totals?.out || 0)}`, margin + 5, y);
      y += 10;

      // Cabeçalho de tabela simples
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("Data", margin + 5, y);
      doc.text("Tipo", margin + 28, y);
      doc.text("Valor", margin + 48, y);
      doc.text("Descrição", margin + 70, y);
      y += 5;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);

      const descW = pageW - (margin + 70) - margin - 6;

      for (const c of (items || [])) {
        const lineNeed = 6;

        if (y + lineNeed > bottom) newPage();

        const d = (c.date || "").split("-").reverse().join("/");
        const tipo = c.type === "in" ? "Entrada" : "Saída";
        const valor = this.fmtBRL(c.value || 0);
        const person = c.personId && peopleIndex?.[c.personId]?.name ? ` • ${peopleIndex[c.personId].name}` : "";
        const desc = `${c.text || ""}${person}`;

        const lines = doc.splitTextToSize(desc, descW);

        const need = (lines.length * 5) + 2;
        if (y + need > bottom) newPage();

        doc.text(d, margin + 5, y);
        doc.text(tipo, margin + 28, y);
        doc.text(valor, margin + 48, y);
        for (let i = 0; i < lines.length; i++) {
          doc.text(lines[i], margin + 70, y + (i * 5));
        }
        y += (lines.length * 5) + 2;
      }

      doc.save(`Dinheiro_${fromStr}_a_${toStr}.pdf`);
    }
  };

  window.BTXPDF = BTXPDF;
})();
// ==== Compatibilidade com o app (para não travar o botão PDF) ====
window.BTXPDF = {
  fmtBRL,
  pdfToday: ({date, tasksByBucket, appts, peopleIndex}) => {
    // peopleIndex pode vir como objeto. seu PDF espera peopleMap (Map).
    const peopleMap = (peopleIndex instanceof Map)
      ? peopleIndex
      : new Map(Object.entries(peopleIndex || {}).map(([id,p]) => [id,p]));
    return pdfAgendaDia(date, tasksByBucket, appts || [], peopleMap);
  },
  pdfCash: ({title, from, to, items, totals, peopleIndex}) => {
    const peopleMap = (peopleIndex instanceof Map)
      ? peopleIndex
      : new Map(Object.entries(peopleIndex || {}).map(([id,p]) => [id,p]));
    return pdfCaixa(from, to, items || [], peopleMap);
  },
  pdfPerson: ({person, timeline, totals, peopleIndex}) => {
    return pdfPessoa(person, timeline || []);
  }
};
