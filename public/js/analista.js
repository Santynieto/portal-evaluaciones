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

  const fuentesHtml = FUENTES_VERIFICACION
    .filter(f => f.url)
    .map(f => `<a class="doc-link" href="${f.url}" target="_blank" rel="noopener">${f.nombre} ↗</a>`)
    .join("");

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
      <td>${badgeHtml(v.nivel_riesgo)}</td>
      <td>${v.notas || "-"}</td>
      <td>${capturaHtml}</td>
      <td>${new Date(v.creado_en).toLocaleString("es-EC")}</td>
    </tr>`;
  }))).join("") || `<tr><td colspan="5"><em>Sin verificaciones registradas todavía.</em></td></tr>`;

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
      <h3>Referencias</h3>
      <ul>${referenciasHtml}</ul>
    ` : "<p><em>El evaluado aún no ha llenado el formulario.</em></p>"}

    <h3>Documentos</h3>
    <div>${enlacesHtml}</div>

    <h3>Fuentes externas — acceso directo</h3>
    <div>${fuentesHtml}</div>

    <h3>Registrar verificación</h3>
    <label for="ver-fuente">Fuente revisada</label>
    <select id="ver-fuente">
      ${FUENTES_VERIFICACION.map(f => `<option value="${f.id}">${f.nombre}</option>`).join("")}
    </select>

    <label for="ver-riesgo">Nivel de riesgo encontrado</label>
    <select id="ver-riesgo">
      <option value="bajo">Bajo</option>
      <option value="medio">Medio</option>
      <option value="alto">Alto</option>
      <option value="critico">Crítico</option>
    </select>

    <label for="ver-notas">Notas</label>
    <textarea id="ver-notas" placeholder="Detalle de lo encontrado..."></textarea>

    <label>Captura de pantalla (opcional)</label>
    <button type="button" class="secundario" id="btn-capturar">Capturar pantalla de otra pestaña</button>
    <span id="captura-estado" style="margin-left:10px; font-size:13px; color:var(--texto-tenue);"></span>
    <img id="captura-preview" class="oculto" style="max-width:280px; display:block; margin-top:10px; border:1px solid var(--borde); border-radius:4px;">

    <div class="error" id="ver-error"></div>
    <button id="btn-guardar-verificacion">Guardar verificación</button>

    <h3 style="margin-top:24px;">Historial de verificaciones</h3>
    <table>
      <thead><tr><th>Fuente</th><th>Riesgo</th><th>Notas</th><th>Captura</th><th>Fecha</th></tr></thead>
      <tbody>${verificacionesHtml}</tbody>
    </table>

    <div class="error" id="estado-error"></div>
    <button id="btn-marcar-revision" ${caso.estado === "en_revision" ? "disabled" : ""}>
      ${caso.estado === "en_revision" ? "Ya está en revisión" : "Marcar como investigado (pasar a En Revisión)"}
    </button>
  `;

  let capturaBlob = null;

  document.getElementById("btn-capturar").addEventListener("click", async () => {
    const estadoEl = document.getElementById("captura-estado");
    estadoEl.textContent = "";
    try {
      estadoEl.textContent = "Elige la pestaña/ventana a capturar en el diálogo del navegador...";
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const video = document.createElement("video");
      video.srcObject = stream;
      await video.play();
      await new Promise(r => setTimeout(r, 250)); // dejar que llegue el primer frame

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0);
      stream.getTracks().forEach(t => t.stop());

      capturaBlob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
      const preview = document.getElementById("captura-preview");
      preview.src = URL.createObjectURL(capturaBlob);
      preview.classList.remove("oculto");
      estadoEl.textContent = "Captura lista — se adjuntará al guardar.";
    } catch (err) {
      estadoEl.textContent = "No se pudo capturar: " + err.message;
    }
  });

  document.getElementById("btn-guardar-verificacion").addEventListener("click", async () => {
    const errorEl = document.getElementById("ver-error");
    errorEl.textContent = "";
    const { data: { user } } = await window.sb.auth.getUser();

    let capturaPath = null;
    if (capturaBlob) {
      capturaPath = `${casoId}/verificaciones/${Date.now()}.png`;
      const { error: uploadError } = await window.sb.storage
        .from("documentos")
        .upload(capturaPath, capturaBlob, { contentType: "image/png" });
      if (uploadError) {
        errorEl.textContent = "Error subiendo la captura: " + uploadError.message;
        return;
      }
    }

    const { error } = await window.sb.from("verificaciones").insert({
      caso_id: casoId,
      fuente: document.getElementById("ver-fuente").value,
      nivel_riesgo: document.getElementById("ver-riesgo").value,
      notas: document.getElementById("ver-notas").value.trim(),
      captura_path: capturaPath,
      analista_user_id: user.id,
    });
    if (error) {
      errorEl.textContent = error.message;
      return;
    }
    abrirDetalle(casoId);
  });

  document.getElementById("btn-marcar-revision").addEventListener("click", async () => {
    const errorEl = document.getElementById("estado-error");
    errorEl.textContent = "";
    const { error } = await window.sb.from("casos").update({ estado: "en_revision" }).eq("id", casoId);
    if (error) {
      errorEl.textContent = error.message;
      return;
    }
    cerrarDetalle();
    cargarCasos();
  });

  document.getElementById("overlay-detalle").classList.remove("oculto");
}

function cerrarDetalle() {
  document.getElementById("overlay-detalle").classList.add("oculto");
}

(async function init() {
  const user = await requerirSesion();
  if (!user) return;
  const analista = await esAnalista(user.id);
  const admin = analista ? false : await esAdmin(user.id);
  if (!analista && !admin) {
    window.location.href = "formulario.html";
    return;
  }
  cargarCasos();
})();
