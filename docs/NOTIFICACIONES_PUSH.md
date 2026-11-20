# Notificaciones push de XR Running Coach

La aplicación envía avisos de mensajes, valoraciones del entrenador y quedadas. Cada cuenta puede elegir la hora local del recordatorio diario y ocultar el contenido de las notificaciones en la pantalla bloqueada. Los recordatorios del plan solo se envían si hay un entrenamiento pendiente ese día. El recordatorio de quedada se envía el día anterior a las personas apuntadas. La persona debe haber activado las notificaciones en ese dispositivo.

## Activar recordatorios diarios en Supabase

1. Si aún no la aplicaste, ejecuta `supabase/migrations/0017_recordatorios_entrenamiento_push.sql`. Después ejecuta `supabase/migrations/0018_preferencias_notificaciones.sql` para guardar la hora elegida y la opción de privacidad.
2. Sube los cambios a GitHub y espera a que Vercel publique la web. Si has cambiado la configuración local, comprueba también que `VITE_VAPID_PUBLIC_KEY` está en las variables del despliegue.
3. En el proyecto descomprimido abre PowerShell y despliega las dos funciones actualizadas:

   ```powershell
   npx supabase functions deploy send-push --project-ref cjcnidfkfnfcmgehktco
   npx supabase functions deploy send-training-reminders --project-ref cjcnidfkfnfcmgehktco
   ```

4. Si todavía no activaste la tarea horaria, en SQL Editor abre otra consulta y ejecuta el bloque de abajo. Sustituye `TU_CLAVE_SECRETA_SB` por la clave `sb_secret_...` del proyecto. No uses la clave publicable `sb_publishable_...`.

   ```sql
   create extension if not exists pg_cron with schema pg_catalog;
   create extension if not exists pg_net with schema extensions;

   select vault.create_secret('https://cjcnidfkfnfcmgehktco.supabase.co', 'xr_project_url');
   select vault.create_secret('TU_CLAVE_SECRETA_SB', 'xr_secret_key');

   select cron.schedule(
     'xr-training-push-hourly',
     '0 * * * *',
     $$
       select net.http_post(
         url := (select decrypted_secret from vault.decrypted_secrets where name = 'xr_project_url') || '/functions/v1/send-training-reminders',
         headers := jsonb_build_object(
           'Content-Type', 'application/json',
           'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'xr_secret_key')
         ),
         body := '{}'::jsonb
       );
     $$
   );
   ```

   Si `vault.create_secret` indica que el nombre ya existe, no repitas esa línea; el secreto ya está guardado.

5. En Supabase → **Integrations → Cron**, confirma que aparece `xr-training-push-hourly`. La función revisa cada hora la hora elegida en la cuenta y deduplica los avisos por dispositivo.
6. Abre la app en el móvil, confirma que las notificaciones están activadas y que existe un plan activo con un entrenamiento pendiente para hoy.

## Contenido y privacidad

- Chat: muestra una vista previa breve del mensaje.
- Valoración: muestra el tipo de entrenamiento, puntuación y comentario abreviado.
- Nueva quedada: avisa a las personas activas de esa comunidad, pero no muestra la ubicación exacta hasta que se apunten.
- Alta en quedada: avisa a quien la organizó.
- Quedada del día siguiente: avisa a quienes ya se han apuntado e incluye el punto de encuentro.
- Entrenamiento del día: muestra el tipo, distancia e indicación abreviada del plan.
- Si se activa **Ocultar el contenido**, los avisos push muestran un texto genérico en lugar del mensaje, los datos del entrenamiento o el lugar de la quedada.

La opción de ocultar el contenido afecta al texto enviado por XR. El sistema operativo del móvil puede seguir mostrando el nombre de la app y el texto genérico según sus propios ajustes.
