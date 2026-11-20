# XR Running Coach — Fase 1 (guía para aplicarla)

Esta entrega **solo contiene los archivos cambiados o nuevos**, con sus rutas. Se copian encima del proyecto
(`Xr-coach-app`) y se hace commit. Base: el repositorio que subiste (migraciones hasta la 0009).

## 1. Qué cambia

| Punto | Cómo queda |
|---|---|
| Registro del atleta | Solo **esfuerzo (RPE 0-10), enlace y notas**. Sin duración, distancia, FC ni métricas. Aplica a la pantalla Hoy y a la tarjeta del calendario |
| Completado automático | Al pulsar «Guardar entrenamiento» la sesión pasa a **completada** sola (antes seguía pendiente si no se tocaba el desplegable). «No pude hacerla» la marca como saltada |
| Entrenador | Botón **«Marcar como completada» / «Volver a pendiente»** en cada sesión (fecha de completada = la de la sesión) |
| Calendario del atleta | Se quitan las barras de **carga semanal** |
| Panel lateral del entrenador | Mismo panel desplegable que el atleta (Atletas · Biblioteca); en móvil, barra inferior |
| Euskera | **Idioma por defecto** (se sigue pudiendo cambiar a castellano con ES/EU y se recuerda). Correcciones en `eu.js` y unidad **bpm** en euskera (ppm en castellano) |
| Pausa de Supabase | Nueva tarea de GitHub `keepalive.yml`: una consulta de lectura cada 3 días |
| Carga (migración 0010) | Sin duración real, el entrenador sigue viendo carga usando la **duración prevista** (estimación) |

## 2. Cómo aplicarla

1. Copia el contenido del zip encima de tu carpeta del proyecto (mismas rutas) y haz commit y push.
2. **Supabase → SQL Editor:** ejecuta `supabase/migrations/0010_carga_con_duracion_prevista.sql`. Es idempotente.
3. En GitHub → **Actions → Mantener Supabase despierto → Run workflow**, para probar. Debe acabar en verde (usa los
   secretos que ya tienes: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`).
4. Espera al despliegue y abre la app con **Ctrl+F5** (o cierra del todo la PWA en el móvil: el service worker guarda la versión anterior).

## 3. Qué se ha verificado y qué no

Verificado:
- 48 tests de la lógica pasan (44 que ya había + 4 nuevos de `sessionLog`), ejecutados con Node.
- Sintaxis de los 14 archivos JS/JSX tocados, imports resueltos y 497 claves idénticas en `es.js` y `eu.js`.
- Todas las claves `t('…')` del código existen; `keepalive.yml` es YAML válido.

**No verificado** (sin red ni base de datos en el entorno donde se preparó):
- `npm run build` real y el aspecto en pantalla (panel lateral del entrenador, formulario nuevo). Si el workflow falla, copia el error.
- La migración 0010 en un Postgres real. Es corta y solo reemplaza un trigger; ejecútala primero en un proyecto de pruebas si puedes.
- Que la consulta de `keepalive.yml` cuente como actividad para Supabase: compruébalo en unas semanas.

## 3 bis. Cosas que conviene saber

- GitHub **desactiva las tareas programadas** de un repositorio público tras 60 días sin actividad en el repositorio. Un commit o «Run workflow» la reactiva.
- La carga semanal del entrenador usa la **duración prevista** cuando no hay real: es una estimación, no un dato medido.
- Las pantallas del entrenador siguen con texto en castellano; con el euskera por defecto se verán mezcladas hasta la Fase 2 (traducción completa).
- Los datos de distancia y FC media que ya tuvieran sesiones **no se borran**: solo se deja de pedirlos.

## 4. Pendiente (Fases 2 y 3)

Traducción de las 12 pantallas sin traducir, plan↔calendario, anamnesis→perfil, tabla de zonas/umbrales sin 220−edad,
carpetas de biblioteca, atleta sin plan y plan modificable, chat profesional y skill de fuerza (falta el enlace).
