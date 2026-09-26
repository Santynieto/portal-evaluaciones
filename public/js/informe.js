// Generación del informe PDF — compartido entre admin.html y analista.html.
const RIESGO_LABEL = { bajo: "BAJO", medio: "MEDIO", alto: "ALTO", critico: "CRÍTICO" };

async function blobUrlADataUrl(url) {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function generarInformePDF(caso, datos, porFuente) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const margenX = 15;
  const anchoUtil = 210 - margenX * 2;
  let y = 20;

  function saltoDePagina(necesario) {
    if (y + necesario > 280) {
      doc.addPage();
      y = 20;
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("DEFENDER — INFORME DE EVALUACIÓN", margenX, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`Generado el ${new Date().toLocaleString("es-EC")}`, margenX, y);
  doc.setTextColor(0);
  y += 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(caso.nombre_completo, margenX, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Empresa solicitante: ${caso.empresa_solicitante || "-"}`, margenX, y); y += 6;
  doc.text(`Tipo de evaluación: ${caso.tipo_evaluacion}`, margenX, y); y += 6;
  doc.text(`Estado: ${caso.estado}`, margenX, y); y += 6;
  doc.text(`Fecha de creación del caso: ${new Date(caso.creado_en).toLocaleDateString("es-EC")}`, margenX, y); y += 10;

  if (caso.nivel_riesgo_final) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(`NIVEL DE RIESGO FINAL: ${RIESGO_LABEL[caso.nivel_riesgo_final] || caso.nivel_riesgo_final}`, margenX, y);
    y += 10;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
  }

  if (datos) {
    saltoDePagina(40);
    doc.setFont("helvetica", "bold");
    doc.text("Datos personales", margenX, y); y += 7;
    doc.setFont("helvetica", "normal");
    doc.text(`Cédula/Pasaporte: ${datos.cedula_pasaporte || "-"}`, margenX, y); y += 6;
    doc.text(`Dirección: ${datos.direccion || "-"}`, margenX, y); y += 6;
    doc.text(`Teléfono: ${datos.telefono || "-"}`, margenX, y); y += 6;
    doc.text(`Cargo/puesto: ${datos.cargo_puesto || "-"}`, margenX, y); y += 10;
  }

  saltoDePagina(15);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Verificación por fases", margenX, y);
  y += 8;
  doc.setFontSize(11);

  for (const fase of FASES_VERIFICACION) {
    const v = porFuente[fase.fuente];
    saltoDePagina(30);
    doc.setFont("helvetica", "bold");
    doc.text(
      `Fase ${fase.numero} · ${fase.titulo}` + (v ? ` — riesgo ${RIESGO_LABEL[v.nivel_riesgo] || v.nivel_riesgo}` : " — sin evaluar"),
      margenX, y
    );
    y += 6;
    doc.setFont("helvetica", "normal");

    if (!v) { y += 4; continue; }

    const notasLineas = doc.splitTextToSize(v.notas || "Sin notas.", anchoUtil);
    doc.text(notasLineas, margenX, y);
    y += notasLineas.length * 5 + 2;
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(new Date(v.actualizado_en || v.creado_en).toLocaleString("es-EC"), margenX, y);
    doc.setTextColor(0);
    doc.setFontSize(11);
    y += 6;

    if (v.captura_path) {
      try {
        const { data: signed } = await window.sb.storage.from("documentos").createSignedUrl(v.captura_path, 300);
        if (signed) {
          const dataUrl = await blobUrlADataUrl(signed.signedUrl);
          const img = new Image();
          await new Promise((resolve) => { img.onload = resolve; img.src = dataUrl; });
          const anchoImg = 100;
          const altoImg = (img.height / img.width) * anchoImg;
          saltoDePagina(altoImg + 6);
          doc.addImage(dataUrl, "PNG", margenX, y, anchoImg, altoImg);
          y += altoImg + 8;
        }
      } catch (e) {
        console.error("No se pudo adjuntar la captura:", e);
      }
    }
    y += 4;
  }

  doc.save(`Informe_${caso.nombre_completo.replace(/\s+/g, "_")}.pdf`);
}

// Trae caso + datos_evaluado + verificaciones y genera el PDF de una vez
// (usado desde el botón de la tabla de casos, sin abrir el detalle).
async function generarInformePDFPorCasoId(casoId) {
  const { data: caso } = await window.sb.from("casos").select("*").eq("id", casoId).single();
  const { data: datos } = await window.sb.from("datos_evaluado").select("*").eq("caso_id", casoId).maybeSingle();
  const { data: verificaciones } = await window.sb.from("verificaciones").select("*").eq("caso_id", casoId);
  const porFuente = {};
  for (const v of verificaciones || []) porFuente[v.fuente] = v;
  const riesgoConsolidado = calcularRiesgoConsolidado(porFuente);
  await generarInformePDF({ ...caso, nivel_riesgo_final: caso.nivel_riesgo_final || riesgoConsolidado }, datos, porFuente);
}
