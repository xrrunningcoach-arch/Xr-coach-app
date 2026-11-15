# XR Running Coach — Quedadas (piloto en Orio, 20810)

Esta carpeta contiene **solo los archivos nuevos o cambiados**, con sus rutas. Se copian encima del proyecto y se sube a GitHub.

## 1. Qué hace

- Sección **Quedadas** en el menú del atleta (en el móvil sustituye a «Estadísticas» en la barra inferior; Estadísticas pasa a «Más») y en el del entrenador.
- Primera vez: **activar quedadas** (perfil social con 18+, normas y nombre visible). Sin esto no se ve nada.
- Crear quedada: título, disciplina, día y hora, duración, distancia, ritmo (de–a), nivel, plazas, lugar.
- Descubrimiento de entrenamientos compatibles (filtros por día, disciplina y nivel), «Me apunto / Me bajo», «Mis entrenamientos», cancelar (organizador) y **Denunciar**.
- El listado muestra solo la comunidad; el lugar exacto y las coordenadas se entregan desde Supabase solo a quien organiza o se apunta.
- **Google Maps:** «Ver en Google Maps» y «Cómo llegar» (enlaces, sin clave de API y sin coste).
- Quedadas semanales: crear una serie y apuntarse o salir de todas las próximas fechas con una sola acción.
- Solicitudes de nuevas comunidades: atletas indican su zona y el administrador puede revisar y abrirla desde Quedadas.
- Estado transparente de Strava, COROS y Bluetooth. El registro manual y el enlace de actividad sí están disponibles; la sincronización automática aún no.

## 2. Archivos

| Ruta | Qué es |
|---|---|
| `supabase/migrations/0012_quedadas.sql` | Tablas, seguridad (RLS) y funciones |
| `supabase/migrations/0013_ubicacion_privada_quedadas.sql` | Protege las ubicaciones exactas y habilita el RPC de listado |
| `supabase/migrations/0014_comunidad_series_conexiones.sql` | Solicitudes de comunidades, series semanales y reservas seguras |
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

1. **Primero en un proyecto de pruebas** (staging): si faltan, ejecuta en orden `0012_quedadas.sql`, `0013_ubicacion_privada_quedadas.sql` y `0014_comunidad_series_conexiones.sql` desde Supabase SQL Editor. La 0013 revoca la lectura directa de la tabla; por eso publica a continuación el código nuevo antes de probar la web.
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

## 7. Despliegue seguro

Aplica primero la migración 0014 en staging y verifica: que una serie semanal cree todas sus fechas; que apuntarse reserve plaza en todas ellas; que abandonar la serie libere las próximas; que la solicitud de zona llegue al panel administrador; y que abrir una comunidad la haga seleccionable para atletas. Después de validar el entorno de pruebas, repite el orden en producción.

Las tarjetas de conexión no activan integraciones de Strava, COROS ni Bluetooth. Informan del estado disponible para que el atleta no confunda un enlace manual con una sincronización automática.
