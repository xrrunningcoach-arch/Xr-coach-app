# Integración Intervals.icu con XR Running Coach

La integración ofrece OAuth por atleta, credenciales privadas, importación de actividades de carrera, recepción por webhook, asociación automática con sesiones planificadas, sincronización de recuperación y análisis de streams (pulso, ritmo, altitud, cadencia y parciales por kilómetro). Solicita `ACTIVITY:READ`; no descarga archivos FIT originales.

## Texto para registrar la aplicación

Usa estos datos en el formulario de Intervals.icu:

- **Nombre:** `XR Running Coach`
- **Descripción formal:**

  > XR Running Coach se integra con Intervals.icu para importar y sincronizar las actividades de carrera que cada atleta haya autorizado desde su cuenta. Los datos se utilizan exclusivamente para mostrar el historial y seguimiento del entrenamiento al atleta y a su entrenador asignado dentro de XR Running Coach. La conexión requiere autorización individual mediante OAuth; XR no solicita ni almacena las contraseñas de Intervals.icu ni de los servicios conectados a esa cuenta. El atleta puede revocar el acceso desde la sección Conexiones de XR Running Coach.

- **Sitio web:** `https://xr-coach-app-git-main-xabat.vercel.app/`
- **Política de privacidad:** `https://xr-coach-app-git-main-xabat.vercel.app/#/privacidad`
- **Plataforma:** Web, si el selector ofrece esa opción.
- **Categoría:** Fitness / Training, si aparece en el selector.
- **Cliente Público:** desmarcado. XR realiza el intercambio OAuth en una función privada del servidor y guarda el secreto fuera del navegador.
- **Requerir PKCE:** marcado. La función de inicio de XR implementa PKCE S256.
- **Redirect URI:** `https://cjcnidfkfnfcmgehktco.supabase.co/functions/v1/intervals-oauth-callback`
- **Webhook URL:** `https://cjcnidfkfnfcmgehktco.supabase.co/functions/v1/intervals-webhook`
- **Webhook types:** marca `ACTIVITY_UPLOADED`, `ACTIVITY_ANALYZED` y `ACTIVITY_UPDATED` para guardar la actividad, sus datos detallados y sus cambios.
- **Webhook Authorization Header:** configura `Bearer <token aleatorio largo>`; debe ser idéntico al secreto `INTERVALS_WEBHOOK_AUTHORIZATION` que se añadirá a Supabase. No reutilices una contraseña personal.
- **URL de retorno a XR:** guarda `XR_APP_URL=https://xr-coach-app-git-main-xabat.vercel.app/` en los secretos de Supabase para que la pantalla final del consentimiento incluya un enlace de vuelta a la app.
- **Scopes solicitados por XR:** `ACTIVITY:READ`.

Antes de guardar, confirma que `cjcnidfkfnfcmgehktco` es el mismo Project Ref del Supabase que usa el dominio de producción actual. Ese Project Ref aparece en la guía existente de notificaciones del proyecto; si se cambió el proyecto, reemplaza el subdominio por el ref vigente en **ambas URL**.

## Preparar y desplegar

1. Publica primero esta carpeta en el repositorio que Vercel despliega y comprueba que su **Root Directory** apunte a la carpeta que contiene `package.json`.
2. En Supabase → **SQL Editor**, ejecuta las migraciones en orden. Si ya instalaste v14, 0020 y 0021 ya están aplicadas; ejecuta solo `0022_intervals_activity_streams.sql`.
3. Crea la aplicación en Intervals.icu. Si queda `Pending`, el flujo OAuth no estará operativo hasta que Intervals.icu la apruebe.
4. En Supabase → **Edge Functions → Secrets**, guarda estos valores (usa los datos de la aplicación de Intervals.icu y no los pegues en el frontend):

   - `INTERVALS_CLIENT_ID`: Client ID de la aplicación.
   - `INTERVALS_CLIENT_SECRET`: Client Secret de la aplicación.
   - `INTERVALS_REDIRECT_URI`: `https://cjcnidfkfnfcmgehktco.supabase.co/functions/v1/intervals-oauth-callback`
   - `INTERVALS_WEBHOOK_AUTHORIZATION`: el mismo valor exacto de `Webhook Authorization Header`.
   - `XR_APP_URL`: dominio actual de producción de XR, por ejemplo `https://xr-coach-app-git-main-xabat.vercel.app/`.

   Supabase proporciona `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` a sus funciones. No los guardes en el código ni en variables `VITE_`.

5. Desde la carpeta del proyecto, inicia sesión y enlaza el proyecto Supabase correcto. Despliega las funciones:

   ```bash
   npx supabase login
   npx supabase link --project-ref cjcnidfkfnfcmgehktco
   npx supabase functions deploy intervals-oauth-start
   npx supabase functions deploy intervals-oauth-callback
   npx supabase functions deploy intervals-webhook
   npx supabase functions deploy intervals-sync
   npx supabase functions deploy intervals-activity-detail
   npx supabase functions deploy intervals-disconnect
   ```

6. En Intervals.icu → Settings → Apps → Manage App, confirma las Redirect URI y Webhook URL exactas y guarda `ACTIVITY_UPLOADED`, `ACTIVITY_ANALYZED`, `ACTIVITY_UPDATED` y la cabecera de autorización.
7. El atleta inicia sesión en XR → **Conexiones** → **Conectar Intervals.icu**. Acepta el permiso de actividades en Intervals.icu. Después vuelve a XR.
8. Comprueba en Supabase que se han insertado actividades de carrera en `intervals_activities`; comprueba también una actividad nueva después de sincronizar el reloj para verificar el webhook.

## Qué hace y qué no hace esta versión

- Cada atleta autoriza su propia cuenta de Intervals.icu; el entrenador no conecta la cuenta del atleta por él.
- Al autorizar, XR intenta importar actividades de carrera de los últimos 90 días. Webhooks y una recuperación automática consultan actividades recientes sin tener que reconectar la cuenta.
- Al abrir el análisis de una actividad se recuperan sus streams y parciales; los streams se reducen a un máximo de 700 puntos para mantener ligera la base de datos. El análisis ofrece gráficos de frecuencia cardiaca, ritmo, altitud y cadencia, más una tabla de parciales por kilómetro.
- El atleta puede desconectar desde **Conexiones**. XR solicita además la revocación del token en Intervals.icu y elimina la credencial local.
- La política RLS permite al atleta y a su entrenador asignado leer los resúmenes importados. El token OAuth y el estado temporal de autorización no son legibles desde el cliente.
- Intervals.icu documenta que sus datos de actividades procedentes de Strava no están disponibles en su API. Para ver streams y ritmos detallados, el reloj debe sincronizarse con Intervals.icu por una fuente cuyos datos pueda servir la API.
- Los gráficos requieren que el dispositivo/origen haya registrado el stream correspondiente. Si no hay pulso, GPS o cadencia, ese gráfico o métrica no aparecerá.

## Si la solicitud de la aplicación queda pendiente

Intervals.icu indica que una aplicación OAuth en estado `Pending` no puede completar la autorización. Espera a que se apruebe antes de probar el botón de XR. No hace falta volver a crear la aplicación mientras la existente siga pendiente.
