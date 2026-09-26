let CASOS = [];

function badgeHtml(estado) {
  return `<span class="badge ${estado}">${estado}</span>`;
}

async function cargarCasos() {
  const { data, error } = await window.sb
    .from("casos")
    .select("*")
    .order("creado_en", { ascending: false });

  if (error) {
    alert("Error cargando casos: " + error.message);
    return;
  }

  CASOS = data;
  const tbody = document.getElementById("tabla-casos");
  tbody.innerHTML = "";

  for (const c of data) {
    const { data: datos } = await window.sb
      .from("datos_evaluado")
      .select("enviado")
      .eq("caso_id", c.id)
      .maybeSingle();

    const tr = document.createElement("tr");
    tr.className = "clickable";
    tr.innerHTML = `
      <td>${c.nombre_completo}</td>
      <td>${c.empresa_solicitante || "-"}</td>
      <td>${c.tipo_evaluacion}</td>
      <td>${badgeHtml(c.estado)}</td>
      <td>${datos && datos.enviado ? "Sí" : "No"}</td>
      <td>${new Date(c.creado_en).toLocaleDateString("es-EC")}</td>
    `;
    tr.addEventListener("click", () => abrirDetalle(c.id));
    tbody.appendChild(tr);
  }
}

function fuenteNombre(id) {
  const f = FUENTES_VERIFICACION.find(f => f.id === id);
  return f ? f.nombre : id;
}

async function abrirDetalle(casoId) {
  const caso = CASOS.find(c => c.id === casoId);
  const { data: datos } = await window.sb
    .from("datos_evaluado")
    .select("*")
    .eq("caso_id", casoId)
    .maybeSingle();

  const { data: archivos } = await window.sb.storage.from("documentos").list(casoId);
  let enlacesHtml = "<em>Sin documentos cargados aún.</em>";
  if (archivos && archivos.length > 0) {
    const enlaces = await Promise.all(archivos.map(async (f) => {
      const { data: signed } = await window.sb.storage
        .from("documentos")
        .createSignedUrl(`${casoId}/${f.name}`, 300);
      return signed ? `<a class="doc-link" href="${signed.signedUrl}" target="_blank" rel="noopener">${f.name}</a>` : "";
    }));
    enlacesHtml = enlaces.join("");
  }

  const referenciasHtml = (datos?.referencias || []).map(r =>
    `<li>${r.nombre} — ${r.relacion} — ${r.telefono} — ${r.email}</li>`
  ).join("") || "<li>Sin referencias registradas.</li>";

  const { data: verificaciones } = await window.sb
    .from("verificaciones")
    .select("*")
    .eq("caso_id", casoId)
    .order("creado_en", { ascending: false });

  const verificacionesHtml = (await Promise.all((verificaciones || []).map(async (v) => {
    let capturaHtml = "-";
    if (v.captura_path) {
      const { data: signed } = await window.sb.storage.from("documentos").createSignedUrl(v.captura_path, 300);
      capturaHtml = signed ? `<a class="doc-link" href="${signed.signedUrl}" target="_blank" rel="noopener">Ver captura ↗</a>` : "-";
    }
    return `
    <tr>
      <td>${fuenteNombre(v.fuente)}</td>
      <td><span class="badge ${v.nivel_riesgo}">${v.nivel_riesgo}</span></td>
      <td>${v.notas || "-"}</td>
      <td>${capturaHtml}</td>
      <td>${new Date(v.creado_en).toLocaleString("es-EC")}</td>
    </tr>`;
  }))).join("") || `<tr><td colspan="5"><em>El analista aún no registró verificaciones.</em></td></tr>`;

  document.getElementById("det-nombre").textContent = caso.nombre_completo;
  document.getElementById("det-contenido").innerHTML = `
    <h3>Datos del formulario</h3>
    ${datos ? `
      <p><strong>Cédula/Pasaporte:</strong> ${datos.cedula_pasaporte || "-"}</p>
      <p><strong>Fecha nacimiento:</strong> ${datos.fecha_nacimiento || "-"}</p>
      <p><strong>Dirección:</strong> ${datos.direccion || "-"}</p>
      <p><strong>Teléfono:</strong> ${datos.telefono || "-"}</p>
      <p><strong>Correo:</strong> ${datos.email_contacto || "-"}</p>
      <p><strong>Cargo:</strong> ${datos.cargo_puesto || "-"}</p>
      <p><strong>Consentimiento LOPDP:</strong> ${datos.consentimiento_lopdp ? "Sí, " + new Date(datos.consentimiento_fecha).toLocaleString("es-EC") : "No"}</p>
      <p><strong>Declaración de veracidad:</strong> ${datos.declaracion_veracidad ? "Sí" : "No"}</p>
      <p><strong>Enviado:</strong> ${datos.enviado ? new Date(datos.enviado_en).toLocaleString("es-EC") : "No enviado todavía"}</p>
      <h3>Referencias</h3>
      <ul>${referenciasHtml}</ul>
    ` : "<p><em>El evaluado aún no ha llenado el formulario.</em></p>"}

    <h3>Documentos</h3>
    <div>${enlacesHtml}</div>

    <h3>Verificaciones del analista</h3>
    <table>
      <thead><tr><th>Fuente</th><th>Riesgo</th><th>Notas</th><th>Captura</th><th>Fecha</th></tr></thead>
      <tbody>${verificacionesHtml}</tbody>
    </table>

    <h3 style="margin-top:24px;">Revisión</h3>
    <label for="det-estado">Estado del caso</label>
    <select id="det-estado">
      <option value="pendiente">Pendiente</option>
      <option value="en_revision">En revisión</option>
      <option value="observado">Observado</option>
      <option value="aprobado">Aprobado</option>
      <option value="rechazado">Rechazado</option>
    </select>

    <label for="det-riesgo-final">Nivel de riesgo final</label>
    <select id="det-riesgo-final">
      <option value="">Sin definir</option>
      <option value="bajo">Bajo</option>
      <option value="medio">Medio</option>
      <option value="alto">Alto</option>
      <option value="critico">Crítico</option>
    </select>

    <label for="det-notas">Notas internas</label>
    <textarea id="det-notas">${caso.notas_admin || ""}</textarea>

    <div class="error" id="det-error"></div>
    <button id="det-guardar">Guardar cambios</button>
    <button class="secundario" id="det-generar-pdf" type="button">Generar PDF para el cliente</button>
  `;

  document.getElementById("det-estado").value = caso.estado;
  document.getElementById("det-riesgo-final").value = caso.nivel_riesgo_final || "";

  document.getElementById("det-guardar").addEventListener("click", async () => {
    const nuevoEstado = document.getElementById("det-estado").value;
    const notas = document.getElementById("det-notas").value;
    const nivelRiesgoFinal = document.getElementById("det-riesgo-final").value || null;
    const { error } = await window.sb
      .from("casos")
      .update({ estado: nuevoEstado, notas_admin: notas, nivel_riesgo_final: nivelRiesgoFinal })
      .eq("id", casoId);

    if (error) {
      document.getElementById("det-error").textContent = error.message;
      return;
    }
    cerrarDetalle();
    cargarCasos();
  });

  document.getElementById("det-generar-pdf").addEventListener("click", () => {
    generarInformePDF(caso, datos, verificaciones || []);
  });

  document.getElementById("overlay-detalle").classList.remove("oculto");
}

function cerrarDetalle() {
  document.getElementById("overlay-detalle").classList.add("oculto");
}

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

const RIESGO_LABEL = { bajo: "BAJO", medio: "MEDIO", alto: "ALTO", critico: "CRÍTICO" };

async function generarInformePDF(caso, datos, verificaciones) {
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
  doc.text("Verificaciones realizadas", margenX, y);
  y += 8;
  doc.setFontSize(11);

  if (verificaciones.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.text("Sin verificaciones registradas.", margenX, y);
    y += 8;
  }

  for (const v of verificaciones) {
    saltoDePagina(30);
    doc.setFont("helvetica", "bold");
    doc.text(`${fuenteNombre(v.fuente)} — riesgo ${RIESGO_LABEL[v.nivel_riesgo] || v.nivel_riesgo}`, margenX, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    const notasLineas = doc.splitTextToSize(v.notas || "Sin notas.", anchoUtil);
    doc.text(notasLineas, margenX, y);
    y += notasLineas.length * 5 + 2;
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(new Date(v.creado_en).toLocaleString("es-EC"), margenX, y);
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

function generarPasswordTemporal() {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return "D" + btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 10) + "!";
}

document.getElementById("form-nuevo-caso").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("error-nuevo-caso");
  const exitoEl = document.getElementById("exito-nuevo-caso");
  const btn = document.getElementById("btn-crear-caso");
  errorEl.textContent = "";
  exitoEl.textContent = "";
  btn.disabled = true;

  const email = document.getElementById("nc-email").value.trim();
  const password = generarPasswordTemporal();

  const payload = {
    email,
    password,
    nombre_completo: document.getElementById("nc-nombre").value.trim(),
    empresa_solicitante: document.getElementById("nc-empresa").value.trim(),
    tipo_evaluacion: document.getElementById("nc-tipo").value,
  };

  try {
    const { data: { session } } = await window.sb.auth.getSession();
    const res = await fetch("/.netlify/functions/crear-evaluado", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Error creando el caso.");
    }

    exitoEl.textContent = `Caso creado. Comparte estas credenciales con el evaluado — correo: ${email} / contraseña temporal: ${password}`;
    e.target.reset();
    cargarCasos();
  } catch (err) {
    errorEl.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

(async function init() {
  const user = await requerirSesion();
  if (!user) return;
  const admin = await esAdmin(user.id);
  if (!admin) {
    const analista = await esAnalista(user.id);
    window.location.href = analista ? "analista.html" : "formulario.html";
    return;
  }
  cargarCasos();
})();
