# XR Running Coach — v4

Plataforma de entrenamiento para un entrenador y sus atletas: planes por macro y mesociclos,
calendario, registro de sesiones con RPE, estadísticas, zonas de FC, biblioteca de plantillas,
chat y panel de cumplimiento. **Coste: 0 €** (React + Vite + Supabase gratuito + GitHub Pages).

## Qué hay de nuevo en la v4

| Para los atletas | Para el entrenador | Para el proyecto |
|---|---|---|
| Pantalla **Hoy** pensada para el móvil: la sesión de hoy y registrarla en pocos toques (estado + RPE + nota) | **Panel de cumplimiento**: quién va retrasado, quién no ha entrenado en días, sesiones muy duras seguidas, quién no tiene nada programado | Sistema visual propio (verde `#173933` + rojo `#c1392b`), tema **oscuro** y claro |
| **App instalable** (PWA) en el móvil, sin tienda | **Invitar atletas** con enlace y códigos de un solo uso / caducidad (opcional) | Tailwind compilado (sin CDN), **tests** automáticos y **CI** gratuito |
| **Castellano y euskera** con un botón | Aplicar plantillas es **atómico** (todo o nada, en una transacción SQL) | Avisos propios (toasts) en lugar de `alert/confirm` |

Guía completa: [`docs/GUIA_v4.md`](docs/GUIA_v4.md).

---

## 1. Crear el proyecto en Supabase (una sola vez)

1. Ve a [supabase.com](https://supabase.com) y crea una cuenta gratuita.
2. Crea un **New project** (elige una contraseña de base de datos y guárdala).
3. Ve a **SQL Editor → New query** y ejecuta, **uno a uno y en este orden**,
   [`supabase/schema.sql`](./supabase/schema.sql) y después las migraciones
   `supabase/migrations/0001` … `0007` (todas son idempotentes: si repites alguna no pasa nada).
   Esto crea las tablas, la seguridad por filas (RLS) y las funciones (`submit_session`,
   `apply_template_application`, códigos de invitación…).
   *Si ya tenías la v4 funcionando, ejecuta solo `0006` y `0007` (son idempotentes).*
4. Abre `supabase/schema.sql` y localiza esta línea, cerca del principio:
   ```sql
   values (1, array['xr.running.coach@gmail.com'])
   ```
   Sustituye ese email por **el correo con el que tú (el entrenador) te vas a
   registrar en la web**. Cualquier persona que se registre con ese email concreto
   se convierte automáticamente en "entrenador"; el resto son "atletas". Si ya
   ejecutaste el script, puedes actualizarlo directamente con:
   ```sql
   update app_config set coach_emails = array['tu-email@ejemplo.com'];
   ```
5. Ve a **Project Settings → API** y copia:
   - `Project URL`
   - `anon public` key

---

## 2. Configurar el proyecto en tu ordenador

```bash
npm install
cp .env.example .env
```

Edita `.env` y pega los dos valores de Supabase del paso anterior:

```
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
```

Arranca en local:

```bash
npm run dev
```

Abre la URL que te muestre (normalmente `http://localhost:5173`), regístrate primero
**con tu email de entrenador** (el que pusiste en `coach_emails`) y confirma el correo
si Supabase lo pide (por defecto pide confirmación; puedes desactivarlo en
**Authentication → Providers → Email → Confirm email**, recomendado mientras pruebas).

---

## 3. Subir a GitHub y desplegar en GitHub Pages

```bash
git init
git add .
git commit -m "XR Running Coach app"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/TU-REPO.git
git push -u origin main
```

En GitHub:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
   (El workflow ya incluido en `.github/workflows/deploy.yml` hace el resto).
2. **Settings → Secrets and variables → Actions → New repository secret**, añade:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Haz un push a `main` (o ve a la pestaña **Actions** y lanza el workflow manualmente).
   En unos minutos tu web estará en `https://TU-USUARIO.github.io/TU-REPO/`.

Cada vez que hagas `git push` a `main`, la web se reconstruye y actualiza sola.

---

## 4. Instalar en el móvil (PWA)

Abre la web en el móvil → menú del navegador → **Añadir a pantalla de inicio** (iOS: Compartir →
*Añadir a pantalla de inicio*). Se abre a pantalla completa, con su icono y sin barra del navegador.
Necesita conexión para guardar; sin ella muestra la última pantalla cargada.

## 5. Desarrollo

```bash
npm ci          # instala exactamente lo del package-lock.json (Node 22 o superior)
npm run dev     # http://localhost:5173
npm test        # 47 tests (node:test + tsx), sin necesidad de Supabase
npm run build   # genera dist/
```

```
src/
  i18n/            es.js · eu.js · index.jsx   (traducciones y hook useT)
  styles/index.css tokens de color (oscuro/claro) y Tailwind v4
  ui/              toasts, confirmaciones, tema
  lib/             lógica pura y probada: dates, stats, cycles, zones, templates, compliance
  components/      Hoy, calendario, estadísticas, panel de cumplimiento, invitaciones…
  pages/           Login, Signup, AthleteHome, CoachHome, CoachAthlete, CoachLibrary…
public/            manifest.webmanifest, sw.js (offline mínimo), iconos
supabase/
  schema.sql · migrations/0001…0007   base de datos
  supabase/tests/                     pruebas SQL: 0005 (atomicidad, RLS, invitaciones) y 0006/0007 (metrics, umbrales, HRV, límite de intentos)
tests/             pruebas de la lógica en src/lib y de las traducciones
```

Para añadir un texto: crea la clave en `src/i18n/es.js` **y** en `eu.js` (el test de traducciones falla si falta una)
y úsala con `const t = useT(); t('clave')`.

## 6. Límites conocidos

- Supabase gratuito pausa el proyecto tras ~1 semana sin uso (entra al panel para reactivarlo) y no incluye copias de seguridad
  diarias: exporta tus datos de vez en cuando.
- Los textos en euskera son una primera traducción: **revísalos** antes de enseñarlos a los atletas (están en `src/i18n/eu.js`).
- Las pantallas del entrenador de la ficha del atleta (calendario, macro/mesociclos, biblioteca) siguen en castellano.
- No hay recuperación de contraseña ni notificaciones push (se pueden añadir con `resetPasswordForEmail` y Web Push).

## Historial

v2: archivar atletas, macrociclos, chat · v3: calendario, estadísticas, biblioteca, zonas manuales (guía v3, retirada: ver [guía v4](docs/GUIA_v4.md)) ·
v4: Hoy móvil, PWA, tema oscuro, euskera, cumplimiento, invitaciones, tests y CI.
