# Portal de Evaluaciones — Defender78

MVP de background check / due diligence: el evaluado recibe usuario y
contraseña, ingresa a un portal, llena sus datos y carga sus documentos;
el equipo Defender revisa cada caso desde un panel de administración.

No requiere Node.js, Python ni ningún build local: es un sitio estático
(HTML/CSS/JS) que habla directo con [Supabase](https://supabase.com)
(base de datos + autenticación + almacenamiento de archivos).

Tema visual: paleta corporativa de Defender78 (blanco humo + rojo, según
el Manual de Marca Grupo Defender ed.01 2026) — no la paleta oscura de
Strategorisk.

- **Repositorio:** https://github.com/Santynieto/portal-evaluaciones
- **Dominio de destino:** `evaluaciones.defender.com.ec`

## Estructura

```
public/            <- esto es lo que se despliega (Vercel/Netlify)
  index.html         Login
  formulario.html     Formulario + carga de documentos (evaluado)
  admin.html          Panel de revisión (equipo Defender)
  js/config.js         Credenciales de conexión a Supabase (editar)
  js/supabaseClient.js
  js/formulario.js
  js/admin.js
supabase/
  schema.sql          Todo el esquema de base de datos + seguridad
```

## Paso 1 — Crear el proyecto en Supabase

1. Ve a https://supabase.com y crea una cuenta / proyecto nuevo (plan gratuito
   alcanza sobradamente para 1-20 evaluaciones/mes).
2. Anota la contraseña de la base de datos que te pida (guárdala aparte).
3. Cuando el proyecto esté listo, ve a **Project Settings > API** y copia:
   - **Project URL**
   - **anon public key**

## Paso 2 — Cargar el esquema de base de datos

1. En el dashboard de Supabase, abre **SQL Editor > New query**.
2. Copia y pega **todo** el contenido de [`supabase/schema.sql`](supabase/schema.sql)
   y ejecútalo (botón Run).
3. Ve a **Storage** y crea un bucket llamado exactamente `documentos`,
   marcado como **privado** (no público). Las políticas de acceso a este
   bucket ya quedaron creadas por el script SQL.

## Paso 3 — Crear tu usuario administrador

1. Ve a **Authentication > Users > Add user** y crea tu propio usuario
   (correo + contraseña) — este será tu login como admin.
2. Copia el **UUID** de ese usuario (columna `id` en la tabla de usuarios).
3. Ve a **SQL Editor** y ejecuta (reemplazando el UUID):
   ```sql
   insert into public.admins (user_id, nombre) values ('PEGA-AQUI-EL-UUID', 'Tu nombre');
   ```

## Paso 4 — Conectar el sitio a tu proyecto

Edita [`public/js/config.js`](public/js/config.js) y reemplaza:

```js
window.SUPABASE_URL = "https://TU-PROYECTO.supabase.co";
window.SUPABASE_ANON_KEY = "TU-ANON-KEY-PUBLICA";
```

con los valores que copiaste en el Paso 1. La `anon key` es pública por
diseño (así funciona Supabase) — la seguridad real la dan las políticas de
"Row Level Security" que ya quedaron en `schema.sql`, no esta llave.

## Paso 5 — Publicar el código en GitHub

Ya existe el repositorio https://github.com/Santynieto/portal-evaluaciones
con el primer commit listo (rama `main`). Cada vez que se edite el código,
el flujo es: `git add -A`, `git commit -m "..."`, `git push`.

## Paso 6 — Desplegar en Netlify o Vercel, conectado al repo de GitHub

1. Entra a https://app.netlify.com (o https://vercel.com) e inicia sesión
   con tu cuenta de GitHub.
2. **Add new site > Import an existing project** (Netlify) o **New
   Project** (Vercel), y selecciona el repositorio `portal-evaluaciones`.
3. Configuración de build:
   - **Build command:** dejar vacío (no hay build).
   - **Publish directory:** `public`
4. Deploy. Con esto, cada `git push` a `main` vuelve a publicar el sitio
   automáticamente.
5. En **Domain settings**, agrega el dominio personalizado
   `evaluaciones.defender.com.ec`.
6. En el panel DNS donde administras `defender.com.ec`, agrega el registro
   que Netlify/Vercel te indique (normalmente un **CNAME** de
   `evaluaciones` apuntando al dominio que te dé la plataforma, ej.
   `tu-sitio.netlify.app` o `cname.vercel-dns.com`).

## Cómo se crea un caso nuevo (flujo del admin)

1. En Supabase Dashboard, **Authentication > Users > Add user**: crea al
   evaluado con su correo y una contraseña temporal. Cópiale el UUID.
2. Entra al **panel admin** del portal (`admin.html`), sección "Nuevo caso":
   pega el UUID, el nombre del evaluado, la empresa solicitante y el tipo
   de evaluación. Esto crea el registro del caso.
3. Envía manualmente al evaluado (por correo/WhatsApp) el enlace del portal,
   su correo y la contraseña temporal.
4. El evaluado ingresa, llena el formulario, sube su cédula y CV, acepta el
   consentimiento LOPDP y envía.
5. Vuelves al panel admin, abres el caso, revisas los datos y documentos,
   cambias el estado (en revisión / observado / aprobado / rechazado) y
   dejas notas internas.

## Pendientes recomendados antes de usarlo en producción real

- **Revisión legal del texto de consentimiento LOPDP** en
  [`public/formulario.html`](public/formulario.html) — el texto incluido es
  un punto de partida razonable, no un dictamen legal.
- **Envío automático de credenciales por correo**: hoy se hace manual. Si
  el volumen crece, se puede automatizar con una función de Supabase Edge
  Functions + un proveedor de correo (ej. Resend), sin necesitar servidor propio.
- **Forzar cambio de contraseña en el primer login** (Supabase lo permite
  vía flujo de "recuperación de contraseña" reutilizado como invitación).
- **Política de retención de datos**: definir cada cuánto se eliminan casos
  antiguos y sus documentos.
- Si el volumen supera ~20-30 casos/mes, vale la pena revisar si conviene
  automatizar la creación de casos (hoy es 100% manual vía dashboard).
