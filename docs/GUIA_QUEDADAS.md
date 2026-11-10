# XR Running Coach — Quedadas (piloto en Orio, 20810)

Esta carpeta contiene **solo los archivos nuevos o cambiados**, con sus rutas. Se copian encima del proyecto y se sube a GitHub.

## 1. Qué hace

- Sección **Quedadas** en el menú del atleta (en el móvil sustituye a «Estadísticas» en la barra inferior; Estadísticas pasa a «Más») y en el del entrenador.
- Primera vez: **activar quedadas** (perfil social con 18+, normas y nombre visible). Sin esto no se ve nada.
- Crear quedada: título, disciplina, día y hora, duración, distancia, ritmo (de–a), nivel, plazas, lugar.
- Lista de próximas (filtros por día y disciplina), «Me apunto / Me bajo», «Mis quedadas», cancelar (organizador) y **Denunciar**.
- **Google Maps:** «Ver en Google Maps» y «Cómo llegar» (enlaces, sin clave de API y sin coste).

## 2. Archivos

| Ruta | Qué es |
|---|---|
| `supabase/migrations/0012_quedadas.sql` | Tablas, seguridad (RLS) y funciones |
| `src/lib/meetups.js`, `src/lib/quedadasApi.js` | Lógica pura y acceso a Supabase |
| `src/components/quedadas/*` | Pantallas |
| `src/components/icons-social.jsx` | Icono |
| `src/i18n/quedadas.es.js`, `quedadas.eu.js` | Textos |
| `src/i18n/index.jsx` | **Cambiado:** fusiona los textos nuevos |
| `src/pages/AthleteHome.jsx`, `src/components/Layout.jsx`, `src/App.jsx` | **Cambiados:** menú y ruta |
| `src/pages/CoachQuedadas.jsx` | Página del entrenador |
| `tests/meetups.test.mjs` | Tests |

## 3. Subirlo a GitHub (con pull request)

```bash
git checkout -b feature/quedadas
# copia el contenido de esta carpeta encima del proyecto (mismas rutas)
npm test
git add .
git commit -m "Quedadas: entrenar acompañado (piloto Orio)"
git push -u origin feature/quedadas
```
Abre el pull request en GitHub, espera el CI en verde (tests y build) y haz merge a `main`: el despliegue es automático.

## 4. Base de datos (Supabase)

1. **Primero en un proyecto de pruebas** (staging): SQL Editor, pega y ejecuta `0012_quedadas.sql`. Es idempotente.
2. Si todo va bien, repite en el proyecto real.
3. **Puntos de encuentro de Orio:** no he inventado ninguno. En Google Maps haz clic derecho sobre el sitio, copia las coordenadas y ejecuta una vez por sitio:
```sql
insert into public.meeting_points (community_id, name, description, lat, lng)
select id, 'NOMBRE DEL SITIO', 'Dónde exactamente', 43.000000, -2.000000
from public.communities where slug = 'orio';
```
Si no añades ninguno, se puede igualmente escribir el lugar a mano en cada quedada.

## 5. Probar con tus amigos

1. Entra tú (entrenador/administrador) en **Quedadas**, activa tu perfil y crea una quedada de prueba.
2. Tus amigos se registran con el enlace de **Invitar atletas**. Aviso: al registrarse eligen entrenador, así que aparecerán como atletas tuyos en tu panel.
3. Cada amigo entra en **Quedadas**, activa el perfil social y se apunta.

## 6. Antes de abrirlo a más gente (importante)

- **Política de privacidad:** añade en `src/lib/legal.js` un apartado sobre quedadas (se muestra nombre visible y participación a otras personas de la comunidad; consentimiento retirable; 18+) y sube `LEGAL_VERSION`. No he tocado ese archivo porque lleva tus datos personales.
- **Moderación:** las denuncias solo las ve el administrador (correo de `coach_emails`): `select * from public.meetup_reports;`. El administrador puede cancelar o borrar cualquier quedada desde SQL.
- **Límites en base de datos:** máximo 5 quedadas activas por persona, solo a 90 días vista, plazas controladas sin carreras entre dos personas.

## 7. Qué se ha verificado y qué no

Verificado: 12 tests de la lógica (validación, enlaces de Google Maps, estados, filtros) y paridad castellano/euskera de los textos nuevos; sintaxis de los 14 archivos JS/JSX.

**No verificado** (no hay base de datos ni red en el entorno donde se preparó):
- La migración 0012 en un Postgres real: pruébala primero en staging.
- `npm run build` y el aspecto en pantalla. Si el CI falla, copia el error.
- La calidad del euskera (primera traducción): revísala.

## 8. Siguientes fases

B: chat por quedada, editar, quedadas recurrentes, asistencia. C: «Añadir a mi calendario», más pueblos, Google Places y mapa embebido.
