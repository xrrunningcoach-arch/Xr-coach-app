# Activar notificaciones en el móvil

La aplicación puede recibir avisos push. Esta primera versión envía un aviso cuando llega un mensaje nuevo del chat entrenador-atleta. Las notificaciones de entrenamientos, quedadas y recordatorios se podrán añadir después.

## Preparación necesaria (una vez)

1. Genera un par de claves VAPID en tu ordenador con `npx web-push generate-vapid-keys`. Obtendrás una clave pública y otra privada. **No compartas ni publiques la privada.**
2. En Vercel, abre el proyecto → **Settings → Environment Variables** y añade `VITE_VAPID_PUBLIC_KEY` con la clave pública. Guarda y vuelve a desplegar la web.
3. En Supabase, abre **SQL Editor**, pega el contenido de `supabase/migrations/0016_notificaciones_push.sql` y pulsa **Run**.
4. En Supabase, abre **Edge Functions → Secrets** y guarda estas tres variables:
   - `VAPID_PUBLIC_KEY`: la clave pública del paso 1.
   - `VAPID_PRIVATE_KEY`: la clave privada del paso 1.
   - `VAPID_SUBJECT`: un contacto de la empresa, por ejemplo `mailto:soporte@tu-dominio.com`.
5. Desde la carpeta de esta aplicación, conecta el CLI de Supabase con el proyecto correcto y publica la función:

   ```bash
   supabase login
   supabase link --project-ref TU_PROJECT_REF
   supabase functions deploy send-push
   ```

   El `project-ref` se ve en la dirección del panel de Supabase. No hace falta copiar aquí claves privadas.
6. Sube el código actualizado a GitHub y espera a que Vercel termine el despliegue.

## Activarlo en cada móvil

- **Android:** abre la web con Chrome, inicia sesión, pulsa el icono de cuenta arriba a la derecha y **Activar notificaciones**. Acepta el permiso del navegador.
- **iPhone/iPad:** abre la web en Safari, usa **Compartir → Añadir a pantalla de inicio**, abre la aplicación instalada, inicia sesión y activa las notificaciones desde el icono de cuenta. iOS admite Web Push para aplicaciones añadidas a la pantalla de inicio desde iOS/iPadOS 16.4.

Cada atleta y entrenador debe aceptar el permiso en su propio dispositivo. Si lo bloqueó anteriormente, puede habilitarlo en los ajustes de notificaciones del navegador o del sistema.

## Seguridad y alcance

La clave privada VAPID se guarda solo en los secretos de Supabase. La web recibe únicamente la clave pública. La función comprueba quién envió el mensaje y quién debe recibirlo; el contenido privado del mensaje no aparece en el aviso. La suscripción de este dispositivo se elimina al cerrar sesión.
