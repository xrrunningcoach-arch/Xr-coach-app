# XR Running Coach — versión 3 (calendario, estadísticas, biblioteca, zonas manuales)

Esta guía explica **qué cambia**, **cómo ejecutarlo** y **dónde está cada cosa** en el código.

---

## 1. Cómo ejecutarlo (resumen)

1. **Supabase → SQL Editor**: ejecuta, en este orden y solo los que aún no hayas ejecutado,
   `0001_security_fixes.sql`, `0002_multidisciplinary.sql`, `0003_atletas_macrociclos_chat.sql`
   y, **nuevo**, `supabase/migrations/0004_calendario_biblioteca_zonas.sql`.
   La 0004 es segura sobre datos existentes: añade columnas y tablas, y rellena las fechas de tus
   planes actuales (ver §5).
2. En la carpeta del proyecto:
   ```bash
   cp .env.example .env        # y rellena VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
   npm install
   npm run dev                 # http://localhost:5173
   ```
   (Nota: no se han añadido dependencias nuevas; `package.json` es el mismo.)
3. Producción: `npm run build` y despliegue como siempre (GitHub Actions `deploy.yml` o `npm run deploy`).
   Recuerda ejecutar la migración 0004 **antes** de publicar la nueva versión.

Si ves el aviso «Falta ejecutar la migración 0004…» es que no se ha ejecutado todavía.

---

## 2. Vista del atleta

| Novedad | Dónde |
|---|---|
| **Panel lateral colapsable** (se recuerda entre visitas; en móvil pasa a pestañas horizontales) | `components/Sidebar.jsx`, `pages/AthleteHome.jsx` |
| **Calendario dinámico** (Semana / Mes), sincronizado con la fecha de hoy; cambia solo a medianoche | `components/AthleteCalendar.jsx`, `components/calendar/*`, `lib/dates.js` |
| **Tarjetas de actividad intactas**: el componente antiguo `SessionRow` se movió tal cual a `components/SessionCard.jsx`; solo cambia el contenedor | `components/SessionCard.jsx` |
| **Estadísticas**: km acumulados por disciplina, tiempo semanal total, desnivel positivo acumulado, con gráficos, tabla de datos y detalle | `components/StatsDashboard.jsx`, `components/charts/*`, `lib/stats.js` |
| **«Calendario» → «Objetivos!»** (carrera, cuenta atrás, objetivos del atleta, hitos) | `components/GoalsView.jsx` |

Cómo se colocan las sesiones: en la vista **Semana** cada día muestra las tarjetas completas; en la vista
**Mes** cada día muestra marcadores compactos (una tarjeta completa no cabe en una celda de ~150 px) y, al
pulsar un día, aparecen debajo las tarjetas completas e idénticas a las de siempre. Las sesiones sin fecha
(planes antiguos que no se pudieron fechar) salen en «Sin día asignado».

Definiciones de las estadísticas: km = `km_estimated` (si no, `metrics.distancia_km` o `distancia_m/1000`);
tiempo = duración planificada, y para sesiones completadas la real si existe; desnivel = `metrics.desnivel_m`;
«hecho» = estado `completado`. Rangos: Plan completo / Mes actual / Últimas 8 / Últimas 4 semanas.

## 3. Vista del entrenador

| Novedad | Dónde |
|---|---|
| **Fechas de inicio y fin en macro y mesociclos**, enlazadas con semanas (cambiar una actualiza la otra). Las sesiones creadas dentro de un ciclo reciben su `session_date` y aparecen en el día correcto del atleta. Aviso si dos ciclos se solapan. | `components/MacroMesoPanel.jsx`, `lib/cycles.js` |
| **Pestaña «Calendario»** en la ficha del atleta: semana/mes, «+» para crear sesión en un día, arrastrar y soltar para mover, editor lateral, importar de la biblioteca | `components/CoachCalendar.jsx`, `components/CoachSessionRow.jsx` |
| **Biblioteca** (menú superior): plantillas independientes de cualquier atleta — sesión suelta, plan/mesociclo y proyecto/macrociclo. Crear, editar, duplicar, eliminar y **Aplicar a un atleta** eligiendo fecha de inicio (la semana 1 empieza el lunes de esa fecha). También hay «A la biblioteca» en sesiones, mesociclos y macrociclos existentes (se guarda una copia sin datos del atleta). | `pages/CoachLibrary.jsx`, `components/library/*`, `lib/templates.js`, `lib/templatesApi.js` |
| **Zonas de FC manuales por atleta**: cada zona (Z1–Z5) puede tener mínimo y máximo propios; si están rellenos **mandan sobre el cálculo automático**; vacíos → automático. Vista previa en vivo, «Copiar valores automáticos», «Vaciar todo». El atleta ve la insignia «Manual». | `components/HrZonesManual.jsx`, `components/ZonesTable.jsx`, `lib/zones.js` |

Aplicar una plantilla **añade** sesiones; no borra ni mueve nada del atleta. Si el atleta no tiene plan, se crea
uno activo con la plantilla. Si falla a mitad, se deshace lo insertado.

## 4. Base de datos (migración 0004)

- `sessions.session_date` (fecha real de cada sesión) y `start_date`/`end_date` en `mesocycles` y `macrocycles`.
- `athlete_hr_zones` (zonas manuales; el atleta lee las suyas, el entrenador escribe) con validación en trigger.
- `library_items` (solo entrenador, RLS): `kind` = session | mesocycle | macrocycle, `payload` jsonb.

## 5. Compatibilidad y reglas de migración

- `day_number` pasa a significar **día de la semana** (1 = lunes … 7 = domingo) y `week_number` sigue
  contando desde la semana (lunes–domingo) que contiene `training_plans.start_date`.
- Los planes existentes con `start_date` se **rellenan automáticamente**: `session_date = lunes de la semana 1
  + (semana−1)·7 + día−1`. Los planes sin `start_date` no se pueden fechar: sus sesiones salen en «Sin día
  asignado» y el entrenador puede usar «Colocar según su semana y día» tras fijar la fecha de inicio.
- Las tarjetas del atleta y el envío de sesiones (`submit_session`) no cambian.
- La pestaña «Calendario» del entrenador (hitos de carrera) pasa a llamarse **«Objetivos!»**, igual que la del atleta;
  la nueva pestaña «Calendario» es el calendario de sesiones.

## 6. Limitaciones conocidas

- El entorno donde se desarrolló no podía descargar paquetes de npm, así que **no se ejecutó `vite build`**. Se
  verificó compilando con esbuild + Tailwind, con una base Postgres 16 local para la migración y con navegador
  (Chromium) contra un Supabase simulado. Haz un `npm run build` tras descomprimir; no hay dependencias nuevas, así
  que no debería haber sorpresas.
- Pendiente de comprobar contra tu Supabase real: RLS de `library_items` y `athlete_hr_zones` (están probadas en
  Postgres local, no en Supabase).
- Si `0002` falla en `grant execute on function public.submit_session` con «function name is not unique», es un
  problema previo (sobrecarga creada en 0001): indica la firma completa en el `grant` o ignóralo si ya está concedido.
- Las plantillas se aplican desde el cliente (varias inserciones con deshacer manual), no en una transacción SQL.
