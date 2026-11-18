# Notificaciones push de XR Running Coach

La aplicación envía avisos de mensajes, valoraciones del entrenador y quedadas. Los recordatorios del plan se programan para las 08:00 de la zona horaria del dispositivo y solo se envían si hay un entrenamiento pendiente ese día. También se envía un recordatorio de quedada el día anterior a las personas apuntadas. La persona debe haber activado las notificaciones en ese dispositivo.

## Activar recordatorios diarios en Supabase

1. En Supabase, abre **SQL Editor → New query** y ejecuta primero el contenido de `supabase/migrations/0017_recordatorios_entrenamiento_push.sql`.
2. Sube los cambios a GitHub y espera a que Vercel publique la web.
3. En el proyecto descomprimido abre PowerShell y despliega las dos funciones:

   ```powershell
   npx supabase functions deploy send-push --project-ref cjcnidfkfnfcmgehktco
   npx supabase functions deploy send-training-reminders --project-ref cjcnidfkfnfcmgehktco
   ```

4. En SQL Editor, abre otra consulta y ejecuta este bloque, sustituyendo `TU_CLAVE_SECRETA_SB` por la clave `sb_secret_...` del proyecto. No uses la clave publicable `sb_publishable_...`.

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

5. En Supabase → **Integrations → Cron**, confirma que aparece `xr-training-push-hourly`. La función revisa la hora local de cada dispositivo y deduplica el aviso para no repetirlo.
6. Abre la app en el móvil, confirma que las notificaciones están activadas y que existe un plan activo con un entrenamiento pendiente para hoy.

## Contenido y privacidad

- Chat: muestra una vista previa breve del mensaje.
- Valoración: muestra el tipo de entrenamiento, puntuación y comentario abreviado.
- Nueva quedada: avisa a las personas activas de esa comunidad, pero no muestra la ubicación exacta hasta que se apunten.
- Alta en quedada: avisa a quien la organizó.
- Quedada del día siguiente: avisa a quienes ya se han apuntado e incluye el punto de encuentro.
- Entrenamiento del día: muestra el tipo, distancia e indicación abreviada del plan.

Los avisos pueden aparecer en la pantalla bloqueada según los ajustes del móvil. Más adelante conviene añadir preferencias para ocultar el texto, elegir hora de recordatorio y silenciar horarios nocturnos.
