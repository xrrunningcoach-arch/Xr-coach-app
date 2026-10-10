# XR Running Coach v4 — guía paso a paso

Para Xabat. Tiempo estimado: 20–30 minutos la primera vez.

## 0. Qué necesitas

- Una cuenta de **GitHub** y otra de **Supabase** (las dos gratis).
- **Node 18 o superior** en tu ordenador (nodejs.org) para probar en local. Para publicar solo con GitHub no es imprescindible.

## 1. Base de datos (Supabase) — hazlo ANTES de publicar

1. Entra en tu proyecto de Supabase → **SQL Editor → New query**.
2. **Si ya tenías la v4 anterior funcionando:** ejecuta, en este orden, `supabase/migrations/0006_integridad_metrics_y_datos_reales.sql` y `0007_tests_umbral_hrv_y_limite_invitaciones.sql`. Si venías de v3, ejecuta antes `0005`.
3. **Si empiezas un proyecto nuevo:** ejecuta uno por uno, en este orden: `supabase/schema.sql`, `0001`, `0002`, `0003`, `0004`, `0005`, `0006`, `0007`.
4. Tu email de entrenador: `update app_config set coach_emails = array['tu-email@ejemplo.com'];`
5. Anota en **Project Settings → API** el *Project URL* y la clave *anon public*.

> Las migraciones se pueden repetir sin romper nada. Si la web enseña un aviso de que falta una migración, es que no se ejecutó.

## 2. Probar en local

```bash
unzip xr-coach-app-v4.zip && cd xr-coach-app-v4
cp .env.example .env      # rellena VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
npm install
npm test                  # debe decir: pass 43
npm run dev               # http://localhost:5173
```

Regístrate con tu email de entrenador. Si Supabase pide confirmar el email y estás probando, desactívalo en *Authentication → Providers → Email → Confirm email*.

## 3. Publicar en GitHub Pages

```bash
git init && git add . && git commit -m "XR Running Coach v4"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/TU-REPO.git
git push -u origin main
```

En GitHub: **Settings → Pages → Source: GitHub Actions**; **Settings → Secrets and variables → Actions** → añade `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Cada `push` a `main` ejecuta los tests, construye y publica en `https://TU-USUARIO.github.io/TU-REPO/`.

Después del primer `npm install`, **sube también `package-lock.json`** (el zip no lo incluye porque se genera en tu máquina).

Primera vez en GitHub: si el workflow falla, abre la pestaña **Actions** y mira el paso rojo; lo más habitual es un secreto mal copiado.

## 4. Invitar atletas

1. Entra como entrenador → botón **Invitar atletas**.
2. Opción simple: copia el **enlace de registro** y envíaselo.
3. Opción con control: activa **«Exigir código de invitación»**, crea un código (usos máximos y caducidad opcionales) y envía el enlace con código. Sin código válido nadie puede registrarse.
4. Puedes desactivar o borrar códigos en cualquier momento.

## 5. Cómo lo usa un atleta

1. Abre el enlace en el móvil y se registra.
2. **Añadir a pantalla de inicio** para instalarlo como app.
3. La pantalla **Hoy** muestra la sesión del día con el **Registro rápido**: elige el esfuerzo (RPE 0–10) y pulsa *Marcar como completada* (o *No pude hacerla*). Las notas y la duración real están en «Notas y más detalles».
4. Arriba a la derecha: botón **ES / EU** (idioma) y botón de **tema** (oscuro / claro). Se recuerdan en ese dispositivo.
5. Calendario, Estadísticas, Objetivos!, Zonas de FC, Test y marcas, Perfil y Chat están en el menú (en móvil, barra inferior y «Más»).

## 6. Cómo lo usas tú cada semana (5 minutos)

1. Abre **Inicio**: el panel de cumplimiento ordena a los atletas por urgencia.
   - **Rojo**: 3+ sesiones sin registrar, cumplimiento < 50 %, o 7+ días sin entrenar.
   - **Ámbar**: sesiones sin registrar, cumplimiento < 75 %, 2+ saltadas, 4+ días sin entrenar, 2+ sesiones con RPE ≥ 9 en 7 días, o nada programado en los próximos 7 días.
   - Cada tarjeta dice el motivo; púlsala para entrar a la ficha.
2. Revisa las sesiones pendientes de revisión y deja valoración/comentario.
3. Programa con **Biblioteca** → *Aplicar a un atleta*. Se aplica entero o no se aplica nada.

Los umbrales están en `src/lib/compliance.js` (`THRESHOLDS`) y se pueden ajustar; los tests protegen su comportamiento.

## 7. Qué se ha verificado y qué no (sé honesto con tus atletas)

Verificado en el entorno de desarrollo:
- 47 tests automáticos de la lógica (fechas incluyendo euskera, estadísticas, ciclos, plantillas, zonas, cumplimiento, paridad ES/EU).
- Migraciones 0001–0007 aplicadas (y 0006/0007 repetidas, para comprobar que son idempotentes) en un Postgres 16 local de prueba, con `supabase/tests/0005_test.sql` y `0006_0007_test.sql` (metrics del entrenador intactas, permisos, test de umbrales, HRV, límite de intentos): atomicidad, permisos, invitaciones y la integración JS→SQL.
- Pantallas revisadas en navegador (Chromium) contra un Supabase simulado: claro/oscuro, móvil/escritorio, ES/EU.

**No verificado** (no había acceso a npm ni a tu Supabase):
- `npm run build` real con Vite y el plugin de Tailwind. El código se compiló con esbuild y Tailwind por separado. El workflow de GitHub lo hará por primera vez: si falla, copia el error y lo arreglamos.
- La seguridad (RLS) contra tu Supabase real; se probó en Postgres local con roles simulados.
- Tailwind v4 requiere navegadores recientes (Safari 16.4+, Chrome 111+, Firefox 128+).

## 8. Pendiente / siguientes pasos

- **Revisar la traducción al euskera** (`src/i18n/eu.js`, ~400 textos). Es una primera versión.
- Las pantallas del entrenador de la ficha del atleta, calendario del entrenador y biblioteca siguen solo en castellano.
- Ideas gratis para más adelante: recuperación de contraseña, exportar datos a CSV, avisos push, importar de Strava.
- Supabase gratuito no hace copias diarias: exporta tus datos de vez en cuando (*Database → Backups* en planes de pago; en el gratuito, `pg_dump` o exportar tablas a CSV).

## 9. Problemas típicos

| Síntoma | Causa | Solución |
|---|---|---|
| Pantalla en blanco en GitHub Pages | Falta un secreto | Revisa los dos secretos y relanza el workflow |
| «Falta ejecutar la migración…» | No se ejecutó 0005 | SQL Editor → ejecuta el archivo |
| Un atleta no puede registrarse | Códigos obligatorios | Envíale el enlace con código o desactiva «Exigir código» |
| Textos en castellano con euskera activo | Pantalla aún sin traducir | Ver sección 8 |
| La app no se actualiza en el móvil | Service worker en caché | Cierra la app del todo y vuelve a abrirla |


## 10. Antes de publicar (a rellenar por el titular)

- Rellena `CONTROLLER` en `src/lib/legal.js` (nombre, NIF, dirección, correo). Los textos de privacidad y términos son un **borrador**: que los revise un profesional jurídico.
- En Supabase → Authentication → Providers → Email, sube la longitud mínima de contraseña a 8 y añade tu URL de GitHub Pages a *Redirect URLs* (necesario para el enlace de recuperación de contraseña).
- El enlace de recuperación usa PKCE: debe abrirse en el mismo navegador donde se pidió.
- Copias de seguridad: el plan gratuito de Supabase no las incluye de forma fiable; decide si pasar a Pro.
