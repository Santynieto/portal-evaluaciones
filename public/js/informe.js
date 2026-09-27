// Generación del informe PDF — compartido entre admin.html y analista.html.
// Colores calcados de la paleta corporativa del Manual de Marca (style.css).
const PDF_COLOR = {
  negro: [37, 37, 37],
  rojo: [221, 18, 1],
  tenue: [138, 143, 153],
  humo: [242, 242, 242],
  borde: [223, 223, 220],
  blanco: [255, 255, 255],
};

const RIESGO_LABEL = { bajo: "BAJO", medio: "MEDIO", alto: "ALTO", critico: "CRÍTICO" };

const RIESGO_ESTILO = {
  bajo: { fill: null, borde: PDF_COLOR.tenue, texto: PDF_COLOR.tenue },
  medio: { fill: PDF_COLOR.tenue, borde: PDF_COLOR.tenue, texto: PDF_COLOR.blanco },
  alto: { fill: PDF_COLOR.negro, borde: PDF_COLOR.negro, texto: PDF_COLOR.blanco },
  critico: { fill: PDF_COLOR.rojo, borde: PDF_COLOR.rojo, texto: PDF_COLOR.blanco },
};

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

function cargarImagen(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.src = dataUrl;
  });
}

async function generarInformePDF(caso, datos, porFuente) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const margenX = 16;
  const anchoPagina = 210;
  const anchoUtil = anchoPagina - margenX * 2;
  let y = 0;

  function saltoDePagina(necesario) {
    if (y + necesario > 272) {
      doc.addPage();
      y = 20;
    }
  }

  // ---- Insignia de nivel de riesgo (recuadro de color) ----
  function dibujarBadge(texto, x, yTop, nivel, alto = 8) {
    const estilo = RIESGO_ESTILO[nivel] || RIESGO_ESTILO.bajo;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    const anchoTexto = doc.getTextWidth(texto);
    const ancho = anchoTexto + 10;
    doc.setDrawColor(...estilo.borde);
    if (estilo.fill) {
      doc.setFillColor(...estilo.fill);
      doc.roundedRect(x, yTop, ancho, alto, 1.2, 1.2, "FD");
    } else {
      doc.roundedRect(x, yTop, ancho, alto, 1.2, 1.2, "D");
    }
    doc.setTextColor(...estilo.texto);
    doc.text(texto, x + 5, yTop + alto / 2 + 3);
    doc.setTextColor(...PDF_COLOR.negro);
    return ancho;
  }

  // ---- Título de sección: barra roja + texto en mayúsculas ----
  function tituloSeccion(texto) {
    saltoDePagina(14);
    doc.setFillColor(...PDF_COLOR.rojo);
    doc.rect(margenX, y, 8, 3, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...PDF_COLOR.negro);
    doc.text(texto.toUpperCase(), margenX + 12, y + 3);
    y += 11;
  }

  function campo(etiqueta, valor) {
    saltoDePagina(7);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...PDF_COLOR.tenue);
    doc.text(etiqueta.toUpperCase(), margenX, y);
    doc.setFontSize(11);
    doc.setTextColor(...PDF_COLOR.negro);
    doc.text(String(valor || "-"), margenX + 48, y);
    y += 7;
  }

  // ======================================================================
  // Portada / encabezado de marca
  // ======================================================================
  doc.setFillColor(...PDF_COLOR.negro);
  doc.rect(0, 0, anchoPagina, 38, "F");
  doc.setFillColor(...PDF_COLOR.rojo);
  doc.rect(0, 38, anchoPagina, 2, "F");

  try {
    const logoDataUrl = await blobUrlADataUrl("assets/logo-defender.png");
    const logoImg = await cargarImagen(logoDataUrl);
    const logoAlto = 9;
    const logoAncho = (logoImg.width / logoImg.height) * logoAlto;
    doc.addImage(logoDataUrl, "PNG", margenX, 12, logoAncho, logoAlto);
  } catch (e) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...PDF_COLOR.humo);
    doc.text("DEFENDER", margenX, 20);
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLOR.tenue);
  doc.text("INFORME DE EVALUACIÓN DE CONFIANZA", margenX, 30);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLOR.tenue);
  doc.text(`Generado el ${new Date().toLocaleString("es-EC")}`, anchoPagina - margenX, 30, { align: "right" });
  doc.setTextColor(...PDF_COLOR.negro);

  y = 52;

  // ---- Nombre + riesgo consolidado, en grande ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(caso.nombre_completo, margenX, y);
  y += 10;

  if (caso.nivel_riesgo_final) {
    dibujarBadge(`RIESGO ${RIESGO_LABEL[caso.nivel_riesgo_final] || caso.nivel_riesgo_final}`, margenX, y, caso.nivel_riesgo_final, 9);
    y += 15;
  } else {
    y += 5;
  }

  // ======================================================================
  // Datos del caso
  // ======================================================================
  tituloSeccion("Datos del caso");
  campo("Empresa solicitante", caso.empresa_solicitante);
  campo("Tipo de evaluación", caso.tipo_evaluacion);
  campo("Estado", caso.estado);
  campo("Fecha de creación", new Date(caso.creado_en).toLocaleDateString("es-EC"));
  y += 4;

  if (datos) {
    tituloSeccion("Datos personales");
    campo("Cédula / Pasaporte", datos.cedula_pasaporte);
    campo("Dirección", datos.direccion);
    campo("Teléfono", datos.telefono);
    campo("Cargo / puesto", datos.cargo_puesto);
    y += 4;
  }

  // ======================================================================
  // Verificación por fases
  // ======================================================================
  tituloSeccion("Verificación por fases");

  for (const fase of FASES_VERIFICACION) {
    const v = porFuente[fase.fuente];
    saltoDePagina(26);

    const yInicioTarjeta = y;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...PDF_COLOR.negro);
    doc.text(`Fase ${fase.numero} · ${fase.titulo}`, margenX, y + 5);

    if (v) {
      const anchoBadge = 100;
      dibujarBadge(RIESGO_LABEL[v.nivel_riesgo] || v.nivel_riesgo, margenX + anchoBadge, y - 1, v.nivel_riesgo, 7);
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...PDF_COLOR.tenue);
      doc.text("SIN EVALUAR", margenX + 100, y + 4);
    }
    y += 9;

    if (!v) {
      y += 6;
      continue;
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...PDF_COLOR.negro);
    const notasLineas = doc.splitTextToSize(v.notas || "Sin notas.", anchoUtil - 4);
    doc.text(notasLineas, margenX, y);
    y += notasLineas.length * 5 + 2;

    doc.setFontSize(8);
    doc.setTextColor(...PDF_COLOR.tenue);
    doc.text(`Actualizado: ${new Date(v.actualizado_en || v.creado_en).toLocaleString("es-EC")}`, margenX, y);
    doc.setTextColor(...PDF_COLOR.negro);
    y += 6;

    if (v.captura_path) {
      try {
        const { data: signed } = await window.sb.storage.from("documentos").createSignedUrl(v.captura_path, 300);
        if (signed) {
          const dataUrl = await blobUrlADataUrl(signed.signedUrl);
          const img = await cargarImagen(dataUrl);
          const anchoImg = 90;
          const altoImg = (img.height / img.width) * anchoImg;
          saltoDePagina(altoImg + 6);
          doc.setDrawColor(...PDF_COLOR.borde);
          doc.rect(margenX - 1, y - 1, anchoImg + 2, altoImg + 2, "D");
          doc.addImage(dataUrl, "PNG", margenX, y, anchoImg, altoImg);
          y += altoImg + 8;
        }
      } catch (e) {
        console.error("No se pudo adjuntar la captura:", e);
      }
    }

    // Línea divisoria sutil entre fases
    doc.setDrawColor(...PDF_COLOR.borde);
    doc.line(margenX, y, anchoPagina - margenX, y);
    y += 8;
  }

  // ======================================================================
  // Pie de página en todas las hojas
  // ======================================================================
  const totalPaginas = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i);
    doc.setDrawColor(...PDF_COLOR.borde);
    doc.line(margenX, 285, anchoPagina - margenX, 285);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...PDF_COLOR.tenue);
    doc.text("DOCUMENTO CONFIDENCIAL — DEFENDER", margenX, 291);
    doc.text(`Página ${i} de ${totalPaginas}`, anchoPagina - margenX, 291, { align: "right" });
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
