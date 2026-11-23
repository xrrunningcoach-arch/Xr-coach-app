# XR Running Coach V16

## Cambios incluidos

- El entrenador ve las actividades importadas de Intervals.icu en una pestaña propia y también en la sesión planificada a la que se asociaron. Puede abrir las gráficas, los parciales por kilómetro y el detalle de la actividad.
- El entrenador puede asignar Z1–Z5 a cada sesión de carrera. El selector muestra el rango de pulsaciones que el entrenador haya guardado para ese atleta; el atleta ve la zona y el rango en Hoy y en el calendario.
- “Mi perfil” reúne Estadísticas, Objetivos, Zonas de FC, Tests y marcas, Anamnesis y Bienestar diario en un selector en la parte superior.
- El atleta puede editar sus objetivos y administrar sus hitos, pruebas y marcas. Se han retirado esas pestañas de edición del entrenador.
- La ficha del entrenador mantiene el perfil del atleta, sin la anamnesis. Se ocultan la escala y las referencias RPE en las vistas del entrenador.
- Se importan desde Intervals.icu los datos de Wellness que estén disponibles y se muestran al atleta y, en modo de solo lectura, a su entrenador.

## Aplicación

1. Ejecuta `supabase/migrations/0023_intervals_wellness_session_zones.sql` en el SQL Editor del proyecto Supabase.
2. Desde esta carpeta del proyecto, inicia sesión/enlaza Supabase como en las versiones anteriores y despliega las funciones actualizadas:

   ```powershell
   npx supabase functions deploy intervals-oauth-start
   npx supabase functions deploy intervals-oauth-callback
   npx supabase functions deploy intervals-sync
   npx supabase functions deploy intervals-activity-detail
   npx supabase functions deploy intervals-webhook
   ```

3. Publica esta versión V16 en GitHub/Vercel usando como directorio raíz `XR-Running-Coach-Notifications-v16`.
4. Cada atleta que ya conectó Intervals.icu debe abrir **Mi perfil → Dispositivos y apps → Actualizar permisos (Wellness)** y aceptar el nuevo permiso. La app pide `ACTIVITY:READ` y `WELLNESS:READ`.
5. En la configuración de la app OAuth de Intervals.icu, activa también el webhook `WELLNESS_UPDATED`, manteniendo los eventos de actividad que ya usas. Al volver a XR, los datos se sincronizan al abrir Hoy o Bienestar. El refresco de respaldo de Wellness se limita a una vez cada 12 horas; el webhook actualiza los cambios diarios al llegar.

Los relojes y plataformas solo pueden aportar a XR los campos que hayan enviado a Intervals.icu. Si no registran HRV, sueño u otro valor, ese campo queda vacío.
