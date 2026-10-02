# Portal de Evaluaciones — Defender78

MVP de background check / due diligence: el evaluado recibe usuario y
contraseña, ingresa a un portal, llena sus datos y carga sus documentos;
un **analista** investiga el caso (documentos + fuentes externas oficiales)
y deja sus hallazgos; el **admin** toma la decisión final desde el panel de
administración.

Tres roles:
- **Evaluado** — llena el formulario y sube documentos (`formulario.html`).
- **Analista** — investiga el caso en **6 fases fijas**, en orden: (1)
  Identidad — ve la cédula que cargó el evaluado + enlace a Whitepages,
  (2) SUPA, (3) Fiscalía, (4) Ministerio del Interior, (5) Consejo de la
  Judicatura, (6) Entorno web. Cada fase tiene su propio enlace directo
  (se abre en pestaña nueva, la pestaña del portal nunca se cierra ni se
  pierde), su **nivel de riesgo** (bajo/medio/alto/crítico), sus notas, y
  opcionalmente una **captura de pantalla** (el analista elige la otra
  pestaña abierta y el portal toma la foto y la guarda — sin Herramienta
  de Recortes ni subir archivos a mano). Cada fase es editable/reanudable
  (no es un historial que se acumula, es un estado por fase). El portal
  calcula el **riesgo consolidado** del caso como el más alto entre las 6
  fases. El analista puede marcar el caso como "en revisión" pero no
  aprobar/rechazar.
- **Admin** — crea casos, ve todo (incluidas las verificaciones del
  analista), define el **nivel de riesgo final** del caso, toma la decisión
  (aprobado/rechazado/observado), y puede **generar un PDF** con todo el
  informe para entregar al cliente (`admin.html`).

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
  analista.html       Investigación (analista)
  admin.html          Panel de revisión y decisión final (equipo Defender)
  js/config.js         Credenciales de conexión a Supabase (editar)
  js/supabaseClient.js  Incluye la lista de fuentes externas (FUENTES_VERIFICACION)
  js/informe.js         Generación del PDF (compartido: admin.html y analista.html)
  js/formulario.js
  js/analista.js
  js/admin.js
netlify/functions/
  crear-evaluado.js      Function servidor: crea usuario+caso en un solo paso
  analizar-documento.js  Function servidor: analiza un PDF (Judicatura o IESS) con Claude
  enviar-informe.js      Function servidor: envía el PDF del informe por correo (Resend)
  verificar-biometria.js Function servidor: compara selfie vs. cédula (AWS Rekognition)
supabase/
  schema.sql               Esquema completo (para una instalación nueva)
  patch_analistas.sql      Parche: agrega el rol analista
  patch_riesgo_captura.sql Parche: niveles de riesgo, capturas y PDF final
  patch_fases.sql          Parche: una fila por caso+fuente (no historial)
  patch_analisis_ia.sql    Parche: columna para los análisis de IA
  patch_biometria.sql      Parche: verificación biométrica al login
  patch_iess.sql           Parche: agrega "iess" como fuente válida
                           (correr los parches solo si el schema.sql ya
                           estaba cargado antes de que existieran)
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

### Crear un usuario analista (opcional)

Si tu proyecto ya tenía cargado `schema.sql` antes de que existiera el rol
analista, primero corre una vez [`supabase/patch_analistas.sql`](supabase/patch_analistas.sql)
completo en el SQL Editor. Luego, igual que con el admin: crea el usuario en
**Authentication > Users**, copia su UUID, y:

```sql
insert into public.analistas (user_id, nombre) values ('PEGA-AQUI-EL-UUID', 'Nombre del analista');
```

Si tu proyecto ya tenía cargado el rol analista pero no los niveles de
riesgo/capturas, corre además [`supabase/patch_riesgo_captura.sql`](supabase/patch_riesgo_captura.sql),
luego [`supabase/patch_fases.sql`](supabase/patch_fases.sql), y luego
[`supabase/patch_analisis_ia.sql`](supabase/patch_analisis_ia.sql), en ese orden.

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

## Paso 7 — Habilitar la creación de casos desde el panel (función servidor)

Desde el panel admin puedes crear el usuario del evaluado y su caso en un
solo paso (sin ir a Supabase Dashboard cada vez), gracias a una función
servidor en `netlify/functions/crear-evaluado.js`. Para que funcione:

1. En Supabase, ve a **Project Settings > API Keys** y copia la clave
   **secreta** (`sb_secret_...` o `service_role`). Esta clave es sensible:
   nunca la pegues en el código ni la compartas por chat.
2. En Netlify, ve a **Project configuration > Environment variables** y
   agrega dos variables:
   - `SUPABASE_URL` = tu Project URL (ej. `https://xxxx.supabase.co`)
   - `SUPABASE_SERVICE_ROLE_KEY` = la clave secreta que copiaste
3. Vuelve a desplegar (un nuevo `git push`, o el botón "Trigger deploy" en
   Netlify) para que la función tome las variables nuevas.

## Paso 8 — Habilitar el análisis con IA de los documentos de Judicatura (opcional)

En la fase de Judicatura, el analista puede subir el/los PDF del juicio
descargados de la Función Judicial y pedirle a Claude (Anthropic) que
resuma el estado del proceso y sugiera un nivel de riesgo. Usa la función
servidor `netlify/functions/analizar-documento.js`. Para activarlo:

1. Crea una cuenta en https://console.anthropic.com (si no tienes) y genera
   una **API key** (Settings > API Keys). Tiene costo por uso — para el
   volumen de este portal, unos centavos de dólar por documento analizado.
2. En Netlify, agrega la variable de entorno:
   - `ANTHROPIC_API_KEY` = la clave que generaste (márcala como "Contains
     secret values")
3. Corre [`supabase/patch_analisis_ia.sql`](supabase/patch_analisis_ia.sql)
   en el SQL Editor de Supabase si tu base de datos ya existía.
4. Vuelve a desplegar (nuevo `git push` o "Trigger deploy").

Sin esta variable configurada, el botón "Analizar con IA" simplemente
mostrará un error — el resto del portal sigue funcionando normal.

## Paso 9 — Habilitar el envío del informe por correo (opcional)

El admin puede mandar el PDF del informe directo por correo desde el panel
(`netlify/functions/enviar-informe.js`, usa [Resend](https://resend.com)).

1. Crea una cuenta en https://resend.com (gratis hasta 3,000 correos/mes).
2. En Resend, ve a **Domains > Add Domain** y agrega `defender.com.ec`.
   Te va a dar registros **TXT/CNAME** de verificación (SPF/DKIM) —
   agrégalos en el mismo panel de zona DNS de nic.ec donde ya agregamos el
   subdominio `evaluaciones` (Nic.ec > Mis Dominios > defender.com.ec >
   Gestiona tu dominio > zona DNS), sin tocar los registros existentes de
   Microsoft 365.
3. Espera a que Resend marque el dominio como **Verified**.
4. En Resend, ve a **API Keys > Create API Key** y cópiala.
5. En Netlify, agrega la variable de entorno `RESEND_API_KEY` (marca
   "Contains secret values").
6. Vuelve a desplegar (nuevo `git push` o "Trigger deploy").

El remitente configurado es `informes@defender.com.ec` (ver
`netlify/functions/enviar-informe.js`, constante `REMITENTE`) — cámbialo
ahí si prefieres otra dirección. Sin `RESEND_API_KEY` configurada, el botón
"Enviar por correo" mostrará un error; el resto del portal sigue
funcionando normal.

**Importante — SPF:** el dominio ya tiene un registro TXT de SPF para
Microsoft 365 (`v=spf1 include:spf.protection.outlook.com ...`). Un
dominio solo puede tener un TXT de SPF válido. Si Resend te da otro TXT
que también empieza con `v=spf1`, **no crees un segundo registro** —
edita el TXT existente y agrégale el `include:` de Resend antes de `~all`,
por ejemplo:
```
v=spf1 include:spf.protection.outlook.com include:amazonses.com ~all
```
(el include exacto de Resend puede variar; usa el que te muestre su panel).

## Paso 10 — Habilitar la verificación biométrica al login (opcional)

Cuando el evaluado ya cargó su cédula, la próxima vez que entre al
formulario se le pide una selfie por cámara, que se compara contra la
foto de su cédula usando **Amazon Rekognition**
(`netlify/functions/verificar-biometria.js`). No bloquea el acceso si no
hay coincidencia clara — solo lo deja registrado para que el equipo
Defender lo revise (visible en el panel de admin y de analista, dentro de
la Fase 1 · Identidad).

1. Crea una cuenta en https://aws.amazon.com (tiene capa gratuita: 5,000
   comparaciones gratis el primer año en cuentas nuevas; después, ~$0.001
   USD por comparación — a tu volumen, centavos al año).
2. En la consola de AWS, ve a **IAM > Users > Create user**. Dale un
   nombre (ej. `portal-evaluaciones-rekognition`) y **no** actives acceso
   a la consola (solo necesita acceso por API).
3. En **Permissions**, elige "Attach policies directly" y crea una
   política personalizada con **solo** este permiso (principio de mínimo
   privilegio — nunca uses una política de administrador completo):
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       { "Effect": "Allow", "Action": "rekognition:CompareFaces", "Resource": "*" }
     ]
   }
   ```
4. Ya creado el usuario, entra a él > **Security credentials** > **Create
   access key** (elige el caso de uso "Application running outside AWS" o
   similar). Copia el **Access Key ID** y el **Secret Access Key** — este
   último solo se muestra una vez.
5. En Netlify, agrega tres variables de entorno:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY` (marca "Contains secret values")
   - `AWS_REGION` (ej. `us-east-1`)
6. Corre [`supabase/patch_biometria.sql`](supabase/patch_biometria.sql) en
   el SQL Editor de Supabase si tu base de datos ya existía.
7. Vuelve a desplegar (nuevo `git push` o "Trigger deploy").

Sin estas variables configuradas, el paso de verificación biométrica
mostrará un error al evaluado — considera desactivarlo temporalmente
(quitando la llamada a `iniciarVerificacionBiometrica()` en
`public/js/formulario.js`) si no vas a configurar esto de inmediato.

## Cómo se crea un caso nuevo (flujo del admin)

1. Entra al **panel admin** del portal (`admin.html`), sección "Nuevo caso":
   escribe el correo del evaluado, su nombre completo, la empresa
   solicitante y el tipo de evaluación, y dale "Crear caso". Esto crea el
   usuario en Supabase Auth (con una contraseña temporal generada
   automáticamente) y el registro del caso, en un solo paso.
2. El panel te muestra la contraseña temporal generada — cópiala y envíasela
   manualmente al evaluado (por correo/WhatsApp) junto con el enlace del
   portal y su correo.
3. El evaluado ingresa, llena el formulario, sube su cédula y CV, acepta el
   consentimiento LOPDP y envía.
4. Vuelves al panel admin, abres el caso, revisas los datos y documentos,
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
