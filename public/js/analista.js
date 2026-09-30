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

    const { data: verificaciones } = await window.sb
      .from("verificaciones")
      .select("fuente, nivel_riesgo")
      .eq("caso_id", c.id);

    const porFuente = {};
    for (const v of verificaciones || []) porFuente[v.fuente] = v;
    const riesgoConsolidado = calcularRiesgoConsolidado(porFuente);

    const fasesTd = FASES_VERIFICACION.map(fase => {
      const v = porFuente[fase.fuente];
      return `<td>${v ? badgeHtml(v.nivel_riesgo) : "<span style='color:var(--texto-tenue)'>-</span>"}</td>`;
    }).join("");

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="clickable" style="cursor:pointer; text-decoration:underline;">${c.nombre_completo}</td>
      <td>${c.empresa_solicitante || "-"}</td>
      <td>${c.tipo_evaluacion}</td>
      <td>${badgeHtml(c.estado)}</td>
      <td>${datos && datos.enviado ? "Sí" : "No"}</td>
      ${fasesTd}
      <td>${riesgoConsolidado ? badgeHtml(riesgoConsolidado) : "<span style='color:var(--texto-tenue)'>-</span>"}</td>
      <td>${new Date(c.creado_en).toLocaleDateString("es-EC")}</td>
      <td><button class="secundario btn-pdf-fila" type="button">PDF</button></td>
    `;
    tr.querySelector(".clickable").addEventListener("click", () => abrirDetalle(c.id));
    tr.querySelector(".btn-pdf-fila").addEventListener("click", (e) => {
      e.stopPropagation();
      generarInformePDFPorCasoId(c.id);
    });
    tbody.appendChild(tr);
  }
}

function fuenteInfo(id) {
  return FUENTES_VERIFICACION.find(f => f.id === id) || { nombre: id, url: null };
}

function analisisCardHtml(a) {
  return `
    <div class="card" style="margin-top:10px;">
      <p style="font-size:13px; color:var(--texto-tenue); margin:0 0 6px;">${a.nombre}</p>
      <p style="margin:0 0 8px;">${a.resumen}</p>
      <span class="badge ${a.nivel_riesgo}">${a.nivel_riesgo}</span>
      <p style="font-size:12px; color:var(--texto-tenue); margin-top:6px;">${a.justificacion || ""}</p>
    </div>`;
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

  const { data: biometria } = await window.sb
    .from("verificaciones_biometricas")
    .select("*")
    .eq("caso_id", casoId)
    .order("creado_en", { ascending: false });

  const biometriaHtml = (await Promise.all((biometria || []).map(async (b) => {
    let fotoHtml = "-";
    if (b.foto_path) {
      const { data: signed } = await window.sb.storage.from("documentos").createSignedUrl(b.foto_path, 300);
      fotoHtml = signed ? `<a class="doc-link" href="${signed.signedUrl}" target="_blank" rel="noopener">Ver selfie ↗</a>` : "-";
    }
    return `<li>${new Date(b.creado_en).toLocaleString("es-EC")} — ${b.similitud != null ? Number(b.similitud).toFixed(0) + "%" : "-"} —
      <span class="badge ${b.aprobado ? "aprobado" : "rechazado"}">${b.aprobado ? "coincide" : "no concluyente"}</span>
      ${b.detalle ? ` — ${b.detalle}` : ""} — ${fotoHtml}</li>`;
  }))).join("") || "<li><em>Sin intentos de verificación biométrica todavía.</em></li>";

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
        <p style="font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:var(--texto-tenue);">Verificación biométrica al login</p>
        <ul>${biometriaHtml}</ul>
      ` : ""}
      ${info.url ? `<p><a class="doc-link" href="${info.url}" target="_blank" rel="noopener">Abrir ${info.nombre} ↗</a></p>` : ""}

      ${fase.fuente === "judicatura" ? `
        <label>Subir documento(s) del juicio (PDF, descargados de Judicatura)</label>
        <input type="file" class="judicatura-archivos" accept="application/pdf" multiple>
        <button type="button" class="secundario judicatura-btn-analizar">Analizar con IA</button>
        <span class="judicatura-estado" style="margin-left:10px; font-size:13px; color:var(--texto-tenue);"></span>
        <div class="judicatura-analisis">${(existente?.analisis_documentos || []).map(analisisCardHtml).join("")}</div>
      ` : ""}

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
      <div class="fase-zona-pegar" tabindex="0" style="display:inline-block; margin-left:10px; padding:11px 16px; border:1px dashed var(--borde); border-radius:4px; font-size:13px; color:var(--texto-tenue); cursor:text;">
        Haz clic aquí y pega con Ctrl+V (usa Win+Shift+S para recortar primero)
      </div>
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
    let analisisDocumentos = [...(porFuente[fuente]?.analisis_documentos || [])];

    const btnAnalizar = card.querySelector(".judicatura-btn-analizar");
    if (btnAnalizar) {
      btnAnalizar.addEventListener("click", async () => {
        const estadoEl = card.querySelector(".judicatura-estado");
        const input = card.querySelector(".judicatura-archivos");
        const contenedor = card.querySelector(".judicatura-analisis");
        const archivos = Array.from(input.files || []);
        if (archivos.length === 0) {
          estadoEl.textContent = "Selecciona al menos un PDF primero.";
          return;
        }
        const { data: { session } } = await window.sb.auth.getSession();

        for (const archivo of archivos) {
          estadoEl.textContent = `Analizando ${archivo.name}...`;
          try {
            const archivoPath = `${casoId}/verificaciones/judicatura_${Date.now()}_${archivo.name}`;
            const { error: uploadError } = await window.sb.storage
              .from("documentos")
              .upload(archivoPath, archivo, { contentType: "application/pdf" });
            if (uploadError) throw new Error("Error subiendo el archivo: " + uploadError.message);

            const base64 = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result.split(",")[1]);
              reader.onerror = reject;
              reader.readAsDataURL(archivo);
            });

            const res = await fetch("/.netlify/functions/analizar-documento", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
              body: JSON.stringify({ pdfBase64: base64, nombreArchivo: archivo.name }),
            });
            const analisis = await res.json();
            if (!res.ok) throw new Error(analisis.error || "Error analizando el documento.");

            const entrada = { archivo_path: archivoPath, nombre: archivo.name, ...analisis, analizado_en: new Date().toISOString() };
            analisisDocumentos.push(entrada);
            contenedor.insertAdjacentHTML("beforeend", analisisCardHtml(entrada));
          } catch (err) {
            estadoEl.textContent = `Error con ${archivo.name}: ${err.message}`;
            return;
          }
        }
        estadoEl.textContent = "Listo. No olvides darle 'Guardar fase' para conservar estos análisis.";
        input.value = "";
      });
    }

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

    card.querySelector(".fase-zona-pegar").addEventListener("paste", (e) => {
      const estadoEl = card.querySelector(".fase-captura-estado");
      const item = Array.from(e.clipboardData.items || []).find(i => i.type.startsWith("image/"));
      if (!item) {
        estadoEl.textContent = "No se encontró ninguna imagen en el portapapeles.";
        return;
      }
      capturaBlob = item.getAsFile();
      const preview = card.querySelector(".fase-captura-preview");
      preview.src = URL.createObjectURL(capturaBlob);
      preview.classList.remove("oculto");
      estadoEl.textContent = "Captura pegada lista — se adjuntará al guardar.";
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
        analisis_documentos: analisisDocumentos,
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
