# Publicar sincronización automática de Intervals.icu

Esta versión importa carreras y, al abrir el análisis, carga gráficos de frecuencia cardiaca, ritmo, altitud y cadencia, con parciales por kilómetro e intervalos detectados cuando estén disponibles. También completa la sesión de carrera del mismo día cuando existe. La distancia y el entrenamiento planificados por el entrenador se conservan. Si ese día no existe una sesión planificada, la actividad se muestra como importada en «Hoy».

## 1. Actualizar la base de datos

En Supabase abre **SQL Editor → New query**. Si todavía no instalaste v14, ejecuta primero `0021_intervals_auto_session_sync.sql`; luego ejecuta el contenido completo de `supabase/migrations/0022_intervals_activity_streams.sql`. Si ya ejecutaste la 0021 para v14, ejecuta solo la 0022. No vuelvas a ejecutar la migración 0020.

## 2. Publicar las funciones de Supabase

Abre PowerShell en la carpeta del proyecto que vas a publicar. Debe ser la carpeta que contiene `supabase\config.toml`. Ejecuta:

```powershell
npx supabase link --project-ref cjcnidfkfnfcmgehktco
npx supabase functions deploy intervals-webhook
npx supabase functions deploy intervals-sync
npx supabase functions deploy intervals-activity-detail
```

La función `intervals-sync` valida la sesión del atleta y usa la conexión OAuth guardada; no añadas tokens de atleta a variables públicas. No hace falta volver a conectar ni desconectar Intervals.icu.

## 3. Revisar Intervals.icu

En la configuración de tu aplicación de Intervals.icu conserva el webhook HTTPS que ya apunta a `intervals-webhook` y su autorización actual. Activa también `ACTIVITY_UPDATED`, además de `ACTIVITY_UPLOADED` y `ACTIVITY_ANALYZED`, para que se reflejen cambios en una actividad. No marques `ACTIVITY_DELETED`: esta primera versión no elimina registros de XR cuando se borra una actividad.

## 4. Publicar la web

Sube el contenido de esta carpeta al repositorio conectado con Vercel y deja que Vercel termine el nuevo despliegue. La app sincroniza al abrir «Hoy» y, mientras permanezca abierta, vuelve a comprobar Intervals.icu cada hora. Los webhooks importan actividades aunque el atleta no tenga la app abierta.

## 5. Comprobar el resultado

Tras aplicar la migración y desplegar las funciones y la web, abre XR como atleta conectado. Una carrera del día que tenga sesión planificada debe aparecer como completada y mostrar sus valores reales. Una actividad sin sesión planificada debe aparecer como «Actividad importada de hoy».

La sincronización de recuperación consulta los últimos siete días y se limita a una petición por hora y atleta. La primera ejecución importa también carreras recientes que no hubieran llegado por webhook. Los streams se guardan reducidos a un máximo de 700 puntos por actividad. Para actividades previas, abre **Ver análisis y gráficos** en la tarjeta para solicitar su detalle de forma segura.

Intervals.icu no sirve por su API los datos de actividades procedentes de Strava. Si la fuente del reloj no aporta streams, XR indicará que el detalle no está disponible; los gráficos dependen de que el archivo original registre pulso, velocidad/GPS o cadencia.
