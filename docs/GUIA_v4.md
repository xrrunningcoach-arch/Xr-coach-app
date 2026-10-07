# XR Running Coach v4 — guía paso a paso

Para Xabat. Tiempo estimado: 20–30 minutos la primera vez.

## 0. Qué necesitas

- Una cuenta de **GitHub** y otra de **Supabase** (las dos gratis).
- **Node 18 o superior** en tu ordenador (nodejs.org) para probar en local. Para publicar solo con GitHub no es imprescindible.

## 1. Base de datos (Supabase) — hazlo ANTES de publicar

1. Entra en tu proyecto de Supabase → **SQL Editor → New query**.
2. **Si ya tenías la v3 funcionando:** copia el contenido de `supabase/migrations/0005_aplicar_plantillas_e_invitaciones.sql`, pégalo y pulsa **Run**. Con eso basta.
3. **Si empiezas un proyecto nuevo:** ejecuta uno por uno, en este orden: `supabase/schema.sql`, `0001`, `0002`, `0003`, `0004`, `0005`.
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
- 43 tests automáticos de la lógica (fechas incluyendo euskera, estadísticas, ciclos, plantillas, zonas, cumplimiento, paridad ES/EU).
- Migración 0005 y sus pruebas (`supabase/tests/0005_test.sql`) en un Postgres 16 local: atomicidad, permisos, invitaciones y la integración JS→SQL.
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
