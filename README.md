# XR Running Coach — Panel de entrenamiento

Aplicación web para que un entrenador programe planes de entrenamiento (adaptados a la
prueba de cada atleta) y sus atletas suban los resultados de cada sesión, con revisión
del entrenador. Es la versión "app" de tu plantilla Excel `Plan_Entrenamiento_5K_11_Semanas`:
la misma estructura (mesociclos, sesiones semanales, RPE teórico/real, zonas de FC,
calendario de hitos, control de test), pero reutilizable para cualquier atleta y cualquier
prueba, sin duplicar archivos.

**Stack:** React + Vite (frontend) · Supabase (base de datos Postgres + login + API),
todo con capa gratuita. Se despliega como página estática en **GitHub Pages**.

---

## 1. Crear el proyecto en Supabase (una sola vez)

1. Ve a [supabase.com](https://supabase.com) y crea una cuenta gratuita.
2. Crea un **New project** (elige una contraseña de base de datos y guárdala).
3. Ve a **SQL Editor → New query**, pega **todo** el contenido de
   [`supabase/schema.sql`](./supabase/schema.sql) de este repositorio y pulsa **Run**.
   Esto crea todas las tablas, la seguridad por filas (RLS) y la función que permite
   a los atletas subir su entrenamiento sin poder tocar lo que programa el entrenador.
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

## 4. Cómo se usa

**Como entrenador** (con el email que pusiste en `coach_emails`):
- Panel con tu lista de atletas y los entrenamientos pendientes de revisar.
- Botón "Copiar enlace de registro" para pasárselo a un atleta nuevo — en cuanto se
  registre, aparece solo en tu lista (no hace falta crear cuentas a mano).
- Entra en un atleta para: editar su perfil/anamnesis, crear su plan (elige una
  prueba del catálogo — 5K/10K/Media/Maratón — o escribe una personalizada, más
  fechas y duración) y pulsar **"Generar esqueleto de plan"**: crea los mesociclos
  y las filas de sesión en blanco, listas para que rellenes tú el contenido real de
  cada entrenamiento (igual que hacías en el Excel).
- En cada sesión puedes editar tipo/descripción/km/RPE teórico, ver lo que ha
  registrado el atleta (estado, RPE real, notas, enlace de Strava/Garmin) y
  dejarle una valoración con estrellas y comentario.
- Pestañas adicionales por atleta: zonas de FC, calendario de hitos, test y marcas.

**Como atleta** (registro libre desde `/#/signup`):
- Ve su plan activo agrupado por semanas, con lo que ha programado el entrenador.
- Pulsa "Registrar" en cada sesión para marcarla como completada/saltada, indicar
  su RPE real, notas y el enlace de Strava/Garmin — sin poder tocar lo que programó
  el entrenador.
- Puede editar su propio perfil/anamnesis en cualquier momento.

---

## 5. Estructura del proyecto

```
supabase/schema.sql        Tablas, seguridad (RLS) y función submit_session()
src/supabaseClient.js      Cliente de Supabase
src/auth/AuthProvider.jsx  Sesión, perfil y rol del usuario actual
src/lib/planGenerator.js   Genera el esqueleto de mesociclos/sesiones por semanas
src/pages/                 Login, Signup, panel de atleta, panel de entrenador
src/components/            Layout, rutas protegidas, badges de estado
```

## 6. Notas y límites conocidos

- La capa gratuita de Supabase pausa el proyecto tras varios días sin uso; entrar
  una vez al panel lo reactiva.
- Por defecto, Supabase exige confirmar el email al registrarse. Puedes desactivarlo
  en **Authentication → Providers → Email** si prefieres que los atletas entren al
  instante.
- Este repositorio no incluye recuperación de contraseña ni edición de email; se
  puede añadir más adelante con `supabase.auth.resetPasswordForEmail`.

---

## Novedades de la versión 2

Antes de subir estos archivos a GitHub, ejecuta una vez en Supabase (SQL Editor) el archivo
`supabase/migrations/0003_atletas_macrociclos_chat.sql`.

- **Archivar / reactivar / eliminar atletas** desde el panel del entrenador.
- **Pestaña "Perfil y mesociclos"** en la ficha de cada atleta: perfil (como el Excel), anamnesis de 21
  preguntas, escala RPE, gráfico de semanas y volumen, y macrociclos > mesociclos > semanas > sesiones con
  semáforo rojo / ámbar / verde editable a mano.
- **Zonas de entrenamiento (% FC máxima)** con códigos Z1 a Z5, FC objetivo en ppm y equivalencia RPE.
- **Chat** entre cada atleta y el entrenador.


---

## Novedades de la versión 3

Antes de subir estos archivos, ejecuta en Supabase (SQL Editor) `supabase/migrations/0004_calendario_biblioteca_zonas.sql`.

- **Atleta:** panel lateral colapsable, **calendario dinámico** (semana/mes, sincronizado con la fecha actual),
  sección **Estadísticas** (km por disciplina, tiempo semanal, desnivel acumulado) y «Calendario» renombrado a **Objetivos!**.
- **Entrenador:** fechas de inicio/fin en macro y mesociclos enlazadas al calendario, calendario del atleta editable
  (crear, arrastrar, importar), **Biblioteca** de plantillas (sesiones, planes, proyectos) y **zonas de FC manuales** por atleta.

Detalle completo, cómo ejecutarlo y limitaciones: [`docs/GUIA_v3.md`](docs/GUIA_v3.md).
