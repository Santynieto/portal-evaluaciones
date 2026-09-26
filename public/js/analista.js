let CASOS = [];

function badgeHtml(valor) {
  return `<span class="badge ${valor}">${valor}</span>`;
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

function fuenteInfo(id) {
  return FUENTES_VERIFICACION.find(f => f.id === id) || { nombre: id, url: null };
}

async function enlaceDocumento(casoId, prefijo) {
  const { data: archivos } = await window.sb.storage.from("documentos").list(casoId);
  const archivo = (archivos || []).find(f => f.name.startsWith(prefijo));
  if (!archivo) return null;
  const { data: signed } = await window.sb.storage
    .from("documentos")
    .createSignedUrl(`${casoId}/${archivo.name}`, 300);
  return signed ? signed.signedUrl : null;
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

  const cedulaUrl = await enlaceDocumento(casoId, "cedula");

  const { data: verificaciones } = await window.sb
    .from("verificaciones")
    .select("*")
    .eq("caso_id", casoId);

  const porFuente = {};
  for (const v of verificaciones || []) porFuente[v.fuente] = v;

  const riesgoConsolidado = calcularRiesgoConsolidado(porFuente);

  const fasesHtml = await Promise.all(FASES_VERIFICACION.map(async (fase) => {
    const existente = porFuente[fase.fuente];
    const info = fuenteInfo(fase.fuente);
    let capturaActualHtml = "";
    if (existente?.captura_path) {
      const { data: signed } = await window.sb.storage.from("documentos").createSignedUrl(existente.captura_path, 300);
      if (signed) capturaActualHtml = `<a class="doc-link" href="${signed.signedUrl}" target="_blank" rel="noopener">Ver captura guardada ↗</a>`;
    }

    return `
    <div class="card" data-fase="${fase.fuente}">
      <h3>Fase ${fase.numero} · ${fase.titulo} ${existente ? badgeHtml(existente.nivel_riesgo) : ""}</h3>
      ${fase.descripcion ? `<p style="font-size:13px; color:var(--texto-tenue);">${fase.descripcion}</p>` : ""}
      ${fase.fuente === "whitepages" ? `
        <p>
          ${cedulaUrl ? `<a class="doc-link" href="${cedulaUrl}" target="_blank" rel="noopener">Ver cédula cargada por el evaluado ↗</a>` : "<em>El evaluado aún no cargó su cédula.</em>"}
        </p>
      ` : ""}
      ${info.url ? `<p><a class="doc-link" href="${info.url}" target="_blank" rel="noopener">Abrir ${info.nombre} ↗</a></p>` : ""}

      <label>Nivel de riesgo</label>
      <select class="fase-riesgo">
        <option value="bajo">Bajo</option>
        <option value="medio">Medio</option>
        <option value="alto">Alto</option>
        <option value="critico">Crítico</option>
      </select>

      <label>Notas</label>
      <textarea class="fase-notas" placeholder="Detalle de lo encontrado...">${existente?.notas || ""}</textarea>

      <label>Captura de pantalla (opcional)</label>
      <button type="button" class="secundario fase-btn-capturar">Capturar pantalla de otra pestaña</button>
      <span class="fase-captura-estado" style="margin-left:10px; font-size:13px; color:var(--texto-tenue);">${capturaActualHtml}</span>
      <img class="fase-captura-preview oculto" style="max-width:280px; display:block; margin-top:10px; border:1px solid var(--borde); border-radius:4px;">

      <div class="error fase-error"></div>
      <button class="fase-btn-guardar">Guardar fase ${fase.numero}</button>
    </div>`;
  }));

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

    <h2 style="margin-top:24px;">Verificación por fases</h2>
    <p>
      Riesgo consolidado: ${riesgoConsolidado ? badgeHtml(riesgoConsolidado) : "<em>Sin fases evaluadas todavía.</em>"}
    </p>
    ${fasesHtml.join("")}

    <div class="error" id="estado-error"></div>
    <button id="btn-marcar-revision" ${caso.estado === "en_revision" ? "disabled" : ""}>
      ${caso.estado === "en_revision" ? "Ya está en revisión" : "Marcar como investigado (pasar a En Revisión)"}
    </button>
  `;

  // Precargar el select de riesgo de cada fase con su valor guardado (o "bajo" por defecto).
  document.querySelectorAll("[data-fase]").forEach((card) => {
    const fuente = card.dataset.fase;
    const existente = porFuente[fuente];
    card.querySelector(".fase-riesgo").value = existente?.nivel_riesgo || "bajo";
  });

  // Un listener por fase: captura y guardado.
  document.querySelectorAll("[data-fase]").forEach((card) => {
    const fuente = card.dataset.fase;
    let capturaBlob = null;

    card.querySelector(".fase-btn-capturar").addEventListener("click", async () => {
      const estadoEl = card.querySelector(".fase-captura-estado");
      estadoEl.textContent = "";
      try {
        estadoEl.textContent = "Elige la pestaña/ventana a capturar...";
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const video = document.createElement("video");
        video.srcObject = stream;
        await video.play();
        await new Promise(r => setTimeout(r, 250));

        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d").drawImage(video, 0, 0);
        stream.getTracks().forEach(t => t.stop());

        capturaBlob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
        const preview = card.querySelector(".fase-captura-preview");
        preview.src = URL.createObjectURL(capturaBlob);
        preview.classList.remove("oculto");
        estadoEl.textContent = "Captura nueva lista — se adjuntará al guardar.";
      } catch (err) {
        estadoEl.textContent = "No se pudo capturar: " + err.message;
      }
    });

    card.querySelector(".fase-btn-guardar").addEventListener("click", async () => {
      const errorEl = card.querySelector(".fase-error");
      errorEl.textContent = "";
      const { data: { user } } = await window.sb.auth.getUser();

      let capturaPath = porFuente[fuente]?.captura_path || null;
      if (capturaBlob) {
        capturaPath = `${casoId}/verificaciones/${fuente}_${Date.now()}.png`;
        const { error: uploadError } = await window.sb.storage
          .from("documentos")
          .upload(capturaPath, capturaBlob, { contentType: "image/png" });
        if (uploadError) {
          errorEl.textContent = "Error subiendo la captura: " + uploadError.message;
          return;
        }
      }

      const { error } = await window.sb.from("verificaciones").upsert({
        caso_id: casoId,
        fuente,
        nivel_riesgo: card.querySelector(".fase-riesgo").value,
        notas: card.querySelector(".fase-notas").value.trim(),
        captura_path: capturaPath,
        analista_user_id: user.id,
      }, { onConflict: "caso_id,fuente" });

      if (error) {
        errorEl.textContent = error.message;
        return;
      }
      abrirDetalle(casoId);
    });
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
