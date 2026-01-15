function fmtBRL(v){
  const n = Number(v||0);
  return n.toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
}
function formatDateBR(ymd){
  const [y,m,d] = (ymd||"").split("-");
  if(!y) return "";
  return `${d}/${m}/${y}`;
}

async function pdfAgendaDia(dateYMD, tasksByBucket, appts, peopleMap){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({unit:"mm", format:"a4"});
  const W = 210, H = 297;
  const margin = 12;
  const innerW = W - margin*2;

  doc.setDrawColor(33,69,103);
  doc.setLineWidth(0.6);
  doc.roundedRect(margin, margin, W - margin*2, H - margin*2, 4, 4);

  doc.setFont("helvetica","bold");
  doc.setFontSize(16);
  doc.text("AGENDA DO DIA", W/2, margin+10, {align:"center"});
  doc.setFontSize(11);
  doc.setFont("helvetica","normal");
  doc.setTextColor(80, 120, 160);
  doc.text(`Data: ${formatDateBR(dateYMD)}`, W/2, margin+16, {align:"center"});
  doc.setTextColor(0,0,0);

  let y = margin + 24;

  function section(title, colorRGB){
    doc.setFillColor(colorRGB[0], colorRGB[1], colorRGB[2]);
    doc.roundedRect(margin+2, y, innerW-4, 8, 2, 2, "F");
    doc.setTextColor(255,255,255);
    doc.setFont("helvetica","bold"); doc.setFontSize(11);
    doc.text(title, margin+6, y+5.6);
    doc.setTextColor(0,0,0);
    y += 12;
  }

  function itemLine(text){
    doc.setFont("helvetica","normal"); doc.setFontSize(10);
    const lines = doc.splitTextToSize(text, innerW-10);
    for (const ln of lines){
      if (y > H - margin - 10) {
        doc.addPage();
        y = margin+12;
        doc.setDrawColor(33,69,103);
        doc.setLineWidth(0.6);
        doc.roundedRect(margin, margin, W - margin*2, H - margin*2, 4, 4);
      }
      doc.circle(margin+6, y-1.5, 1.2, "S");
      doc.text(ln, margin+10, y);
      y += 5.2;
    }
  }

  const buckets = [
    {k:"must", title:"NÃO POSSO FALHAR", color:[255,91,110]},
    {k:"money", title:"GERA DINHEIRO", color:[41,209,125]},
    {k:"extra", title:"SE SOBRAR TEMPO", color:[64,156,255]},
  ];

  for (const b of buckets){
    const items = tasksByBucket[b.k] || [];
    if(!items.length) continue;
    section(b.title, b.color);
    for (const t of items){
      const who = t.personId ? (peopleMap.get(t.personId)?.name || "") : "";
      const suffix = who ? ` • ${who}` : "";
      const done = t.done ? " (feito)" : "";
      itemLine(`${t.text}${suffix}${done}`);
    }
    y += 2;
  }

  section("COMPROMISSOS", [120,160,200]);
  if(!appts.length){
    itemLine("Sem compromissos cadastrados.");
  } else {
    for (const a of appts){
      const who = a.personId ? (peopleMap.get(a.personId)?.name || "") : "";
      const st = a.status ? ` • ${a.status}` : "";
      itemLine(`${a.time || "--:--"} — ${a.text}${who ? " • "+who : ""}${st}`);
    }
  }

  doc.setFontSize(9);
  doc.setTextColor(120,120,120);
  doc.text("BTX Agenda TDAH • PDF enquadrado com borda", W/2, H - margin + 6, {align:"center"});

  doc.save(`BTX_Agenda_${dateYMD}.pdf`);
}

async function pdfCaixa(fromYMD, toYMD, cashItems, peopleMap){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({unit:"mm", format:"a4"});
  const W = 210, H = 297;
  const margin = 12;
  const innerW = W - margin*2;

  doc.setDrawColor(33,69,103);
  doc.setLineWidth(0.6);
  doc.roundedRect(margin, margin, W - margin*2, H - margin*2, 4, 4);

  doc.setFont("helvetica","bold");
  doc.setFontSize(16);
  doc.text("RELATÓRIO DE CAIXA", W/2, margin+10, {align:"center"});
  doc.setFontSize(11);
  doc.setFont("helvetica","normal");
  doc.setTextColor(80, 120, 160);
  doc.text(`Período: ${formatDateBR(fromYMD)} a ${formatDateBR(toYMD)}`, W/2, margin+16, {align:"center"});
  doc.setTextColor(0,0,0);

  let totalIn = 0, totalOut = 0;
  for (const c of cashItems){
    if(c.type==="in") totalIn += Number(c.value||0);
    else totalOut += Number(c.value||0);
  }
  const balance = totalIn - totalOut;

  let y = margin + 24;
  doc.setFillColor(16,43,71);
  doc.roundedRect(margin+2, y, innerW-4, 18, 2, 2, "F");
  doc.setTextColor(255,255,255);
  doc.setFont("helvetica","bold"); doc.setFontSize(10);
  doc.text(`Entradas: ${fmtBRL(totalIn)}`, margin+6, y+7);
  doc.text(`Saídas: ${fmtBRL(totalOut)}`, margin+6, y+12.5);
  doc.text(`Saldo: ${fmtBRL(balance)}`, margin+110, y+10);
  doc.setTextColor(0,0,0);
  y += 24;

  doc.setFillColor(64,156,255);
  doc.roundedRect(margin+2, y, innerW-4, 8, 2, 2, "F");
  doc.setTextColor(255,255,255);
  doc.setFont("helvetica","bold"); doc.setFontSize(10);
  doc.text("Data", margin+6, y+5.6);
  doc.text("Tipo", margin+30, y+5.6);
  doc.text("Valor", margin+52, y+5.6);
  doc.text("Categoria", margin+78, y+5.6);
  doc.text("Descrição / Pessoa", margin+120, y+5.6);
  doc.setTextColor(0,0,0);
  y += 12;

  doc.setFont("helvetica","normal"); doc.setFontSize(9);
  for (const c of cashItems){
    if (y > H - margin - 12) {
      doc.addPage();
      y = margin+12;
      doc.setDrawColor(33,69,103);
      doc.setLineWidth(0.6);
      doc.roundedRect(margin, margin, W - margin*2, H - margin*2, 4, 4);
    }
    const who = c.personId ? (peopleMap.get(c.personId)?.name || "") : "";
    const typeLabel = c.type === "in" ? "Entrada" : "Saída";
    const line = `${c.text || ""}${who ? " • "+who : ""}`;
    doc.text(formatDateBR(c.date), margin+6, y);
    doc.text(typeLabel, margin+30, y);
    doc.text(fmtBRL(c.value), margin+52, y);
    doc.text(String(c.category||""), margin+78, y);
    const lines = doc.splitTextToSize(line, (innerW - 120));
    doc.text(lines, margin+120, y);
    y += Math.max(6, lines.length*4.2);
  }

  doc.setFontSize(9);
  doc.setTextColor(120,120,120);
  doc.text("BTX Agenda TDAH • PDF enquadrado com borda", W/2, H - margin + 6, {align:"center"});
  doc.save(`BTX_Caixa_${fromYMD}_a_${toYMD}.pdf`);
}

async function pdfPessoa(person, timelineItems){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({unit:"mm", format:"a4"});
  const W=210,H=297, margin=12, innerW=W-margin*2;

  doc.setDrawColor(33,69,103); doc.setLineWidth(0.6);
  doc.roundedRect(margin, margin, W - margin*2, H - margin*2, 4, 4);

  doc.setFont("helvetica","bold"); doc.setFontSize(16);
  doc.text("EXTRATO LONGITUDINAL", W/2, margin+10, {align:"center"});
  doc.setFontSize(11); doc.setFont("helvetica","normal");
  doc.setTextColor(80,120,160);
  doc.text(`Pessoa: ${person.name}`, W/2, margin+16, {align:"center"});
  doc.setTextColor(0,0,0);

  let y=margin+26;
  doc.setFillColor(16,43,71);
  doc.roundedRect(margin+2, y, innerW-4, 16, 2, 2, "F");
  doc.setTextColor(255,255,255);
  doc.setFont("helvetica","bold"); doc.setFontSize(10);
  doc.text(`Contato: ${person.phone || "-"}`, margin+6, y+7);
  doc.text(`Observações: ${person.notes ? person.notes.slice(0,55) : "-"}`, margin+6, y+12.5);
  doc.setTextColor(0,0,0);
  y += 22;

  doc.setFillColor(64,156,255);
  doc.roundedRect(margin+2, y, innerW-4, 8, 2, 2, "F");
  doc.setTextColor(255,255,255);
  doc.setFont("helvetica","bold"); doc.setFontSize(10);
  doc.text("Linha do tempo", margin+6, y+5.6);
  doc.setTextColor(0,0,0);
  y += 12;

  doc.setFont("helvetica","normal"); doc.setFontSize(9);
  for (const it of timelineItems){
    if (y > H - margin - 12) {
      doc.addPage();
      y=margin+12;
      doc.setDrawColor(33,69,103); doc.setLineWidth(0.6);
      doc.roundedRect(margin, margin, W - margin*2, H - margin*2, 4, 4);
    }
    const title = `${formatDateBR(it.date)} • ${it.type}`;
    doc.setFont("helvetica","bold"); doc.text(title, margin+6, y);
    y += 5.2;
    doc.setFont("helvetica","normal");
    const lines = doc.splitTextToSize(it.text || "", innerW-10);
    doc.text(lines, margin+10, y);
    y += Math.max(6, lines.length*4.2);
    y += 2;
  }

  doc.setFontSize(9);
  doc.setTextColor(120,120,120);
  doc.text("BTX Agenda TDAH • PDF enquadrado com borda", W/2, H - margin + 6, {align:"center"});
  doc.save(`BTX_Pessoa_${(person.name||"pessoa").replace(/\\s+/g,"_")}.pdf`);
}
