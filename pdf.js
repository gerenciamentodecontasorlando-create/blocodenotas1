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
      doc.setTextColor
