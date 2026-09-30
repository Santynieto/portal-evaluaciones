let CASO = null;
let DATOS = null;

function crearFilaReferencia(ref = {}) {
  const div = document.createElement("div");
  div.className = "referencia-item";
  div.innerHTML = `
    <button type="button" class="quitar">Quitar</button>
    <label>Nombre completo</label>
    <input type="text" class="ref-nombre" value="${ref.nombre || ""}">
    <label>Relación (laboral / personal)</label>
    <input type="text" class="ref-relacion" value="${ref.relacion || ""}">
    <label>Teléfono</label>
    <input type="tel" class="ref-telefono" value="${ref.telefono || ""}">
    <label>Correo</label>
    <input type="email" class="ref-email" value="${ref.email || ""}">
  `;
  div.querySelector(".quitar").addEventListener("click", () => div.remove());
  document.getElementById("lista-referencias").appendChild(div);
}

function leerReferencias() {
  return [...document.querySelectorAll(".referencia-item")].map((el) => ({
    nombre: el.querySelector(".ref-nombre").value.trim(),
    relacion: el.querySelector(".ref-relacion").value.trim(),
    telefono: el.querySelector(".ref-telefono").value.trim(),
    email: el.querySelector(".ref-email").value.trim(),
  })).filter(r => r.nombre);
}

function aplicarSoloLectura(bloqueado) {
  document.querySelectorAll("#form-evaluado input, #form-evaluado button").forEach(el => {
    if (el.id !== "btn-agregar-ref") el.disabled = bloqueado;
  });
  document.getElementById("nota-solo-lectura").classList.toggle("oculto", !bloqueado);
}

async function subirDocumentoSiCorresponde(inputId, nombreArchivo) {
  const input = document.getElementById(inputId);
  const file = input.files[0];
  if (!file) return;
  const ext = file.name.split(".").pop();
  const ruta = `${CASO.id}/${nombreArchivo}.${ext}`;
  const { error } = await window.sb.storage.from("documentos").upload(ruta, file, { upsert: true });
  if (error) throw new Error(`Error subiendo ${nombreArchivo}: ${error.message}`);
}

async function marcarDocumentosExistentes() {
  const { data } = await window.sb.storage.from("documentos").list(CASO.id);
  if (!data) return false;
  const tieneCedula = data.some(f => f.name.startsWith("cedula"));
  if (tieneCedula) {
    document.getElementById("doc_cedula_ok").classList.remove("oculto");
  }
  if (data.some(f => f.name.startsWith("cv"))) {
    document.getElementById("doc_cv_ok").classList.remove("oculto");
  }
  return tieneCedula;
}

async function iniciarVerificacionBiometrica() {
  const cardBiometria = document.getElementById("card-biometria");
  const formEl = document.getElementById("form-evaluado");
  const video = document.getElementById("video-biometria");
  const canvas = document.getElementById("canvas-biometria");
  const errorEl = document.getElementById("error-biometria");
  const exitoEl = document.getElementById("exito-biometria");
  const btnFoto = document.getElementById("btn-tomar-foto");
  const btnSinCamara = document.getElementById("btn-continuar-sin-camara");

  cardBiometria.classList.remove("oculto");
  formEl.classList.add("oculto");

  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
    video.srcObject = stream;
  } catch (err) {
    errorEl.textContent = "No se pudo acceder a la cámara: " + err.message;
    btnFoto.classList.add("oculto");
    btnSinCamara.classList.remove("oculto");
  }

  btnSinCamara.addEventListener("click", () => {
    cardBiometria.classList.add("oculto");
    formEl.classList.remove("oculto");
  });

  btnFoto.addEventListener("click", async () => {
    errorEl.textContent = "";
    exitoEl.textContent = "";
    btnFoto.disabled = true;
    btnFoto.textContent = "Verificando...";
    try {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const { data: { session } } = await window.sb.auth.getSession();
      const res = await fetch("/.netlify/functions/verificar-biometria", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ selfieBase64: base64 }),
      });
      const resultado = await res.json();
      if (!res.ok) throw new Error(resultado.error || "Error verificando tu identidad.");

      if (stream) stream.getTracks().forEach(t => t.stop());

      if (resultado.aprobado) {
        exitoEl.textContent = `Identidad verificada (${resultado.similitud.toFixed(0)}% de coincidencia). Continuando...`;
      } else {
        exitoEl.textContent = `No logramos confirmar una coincidencia clara (${resultado.similitud.toFixed(0)}%). Puedes continuar — el equipo Defender revisará esto manualmente.`;
      }

      setTimeout(() => {
        cardBiometria.classList.add("oculto");
        formEl.classList.remove("oculto");
      }, 1800);
    } catch (err) {
      errorEl.textContent = err.message;
      btnFoto.disabled = false;
      btnFoto.textContent = "Tomar foto y verificar";
    }
  });
}

async function init() {
  const user = await requerirSesion();
  if (!user) return;

  const { data: casos, error: errCasos } = await window.sb
    .from("casos")
    .select("*")
    .eq("evaluado_user_id", user.id)
    .order("creado_en", { ascending: false })
    .limit(1);

  if (errCasos || !casos || casos.length === 0) {
    document.getElementById("titulo-caso").textContent = "No tienes ninguna evaluación asignada todavía.";
    document.getElementById("contenido").classList.remove("oculto");
    document.getElementById("form-evaluado").classList.add("oculto");
    return;
  }

  CASO = casos[0];
  document.getElementById("titulo-caso").textContent = `Evaluación de ${CASO.nombre_completo}`;
  const badge = document.getElementById("badge-estado");
  badge.textContent = CASO.estado;
  badge.className = `badge ${CASO.estado}`;

  const { data: datos } = await window.sb
    .from("datos_evaluado")
    .select("*")
    .eq("caso_id", CASO.id)
    .maybeSingle();

  DATOS = datos;

  if (datos) {
    document.getElementById("cedula").value = datos.cedula_pasaporte || "";
    document.getElementById("fecha_nacimiento").value = datos.fecha_nacimiento || "";
    document.getElementById("direccion").value = datos.direccion || "";
    document.getElementById("telefono").value = datos.telefono || "";
    document.getElementById("email_contacto").value = datos.email_contacto || "";
    document.getElementById("cargo_puesto").value = datos.cargo_puesto || "";
    document.getElementById("consentimiento_lopdp").checked = !!datos.consentimiento_lopdp;
    document.getElementById("declaracion_veracidad").checked = !!datos.declaracion_veracidad;
    (datos.referencias || []).forEach(crearFilaReferencia);
  }
  if (!datos || !datos.referencias || datos.referencias.length === 0) {
    crearFilaReferencia();
  }

  const tieneCedula = await marcarDocumentosExistentes();

  if (datos && datos.enviado) {
    aplicarSoloLectura(true);
  }

  document.getElementById("contenido").classList.remove("oculto");

  if (tieneCedula) {
    iniciarVerificacionBiometrica();
  }
}

document.getElementById("btn-agregar-ref").addEventListener("click", () => crearFilaReferencia());

document.getElementById("form-evaluado").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("error-form");
  const exitoEl = document.getElementById("exito-form");
  errorEl.textContent = "";
  exitoEl.textContent = "";
  const btn = document.getElementById("btn-enviar");
  btn.disabled = true;

  try {
    await subirDocumentoSiCorresponde("doc_cedula", "cedula");
    await subirDocumentoSiCorresponde("doc_cv", "cv");

    const payload = {
      caso_id: CASO.id,
      cedula_pasaporte: document.getElementById("cedula").value.trim(),
      fecha_nacimiento: document.getElementById("fecha_nacimiento").value,
      direccion: document.getElementById("direccion").value.trim(),
      telefono: document.getElementById("telefono").value.trim(),
      email_contacto: document.getElementById("email_contacto").value.trim(),
      cargo_puesto: document.getElementById("cargo_puesto").value.trim(),
      referencias: leerReferencias(),
      consentimiento_lopdp: document.getElementById("consentimiento_lopdp").checked,
      consentimiento_fecha: new Date().toISOString(),
      declaracion_veracidad: document.getElementById("declaracion_veracidad").checked,
      enviado: true,
      enviado_en: new Date().toISOString(),
    };

    const { error } = await window.sb.from("datos_evaluado").upsert(payload);
    if (error) throw new Error(error.message);

    exitoEl.textContent = "Tu evaluación fue enviada correctamente. El equipo Defender la revisará en breve.";
    aplicarSoloLectura(true);
  } catch (err) {
    errorEl.textContent = err.message || "Ocurrió un error al enviar el formulario.";
    btn.disabled = false;
  }
});

init();
