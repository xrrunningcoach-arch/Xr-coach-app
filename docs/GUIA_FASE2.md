# XR Running Coach — Fase 2 completa (guía para aplicarla)

**Requisito:** haber aplicado antes la Fase 1 (`xr-coach-app-fase1.zip`, ya aplicada). Este zip contiene **todo lo de la Fase 2**
(2a + 2b): solo los archivos cambiados o nuevos, con sus rutas. Se copian encima del proyecto y se hace commit. Si ya habías
aplicado el zip anterior de la Fase 2, este lo sustituye: copia encima sin problema.

## 1. Qué cambia

| Punto | Cómo queda |
|---|---|
| Zonas, umbrales y RPE | Tabla única por atleta: **zona · RPE · pulso (bpm) · ritmo (min/km) · % FC máx · aplicación**, y debajo **VT1, VT2, vAM y lactato** del último test. El entrenador escribe a mano pulso y ritmo de cada zona. **Desaparece el 220 − edad** y el campo Edad de las zonas |
| RPE enlazado con las zonas | La escala RPE muestra la zona de FC de cada tramo, con introducción para el atleta (en su sección «Zonas de FC» y en el perfil que ve el entrenador) |
| Anamnesis → perfil | Al guardar el cuestionario se rellenan solos los campos del perfil y el nombre y la edad. El atleta ya no tiene un formulario de perfil aparte |
| Biblioteca con carpetas | Cada entrenador crea, renombra y borra sus carpetas y mueve plantillas a ellas (al borrar una carpeta, las plantillas pasan a «Sin carpeta») |
| Aplicar a varios atletas | Se marcan uno o varios atletas; cada uno se aplica por separado (todo o nada) y se ve el resultado de cada uno |
| **Plan y sesiones ↔ calendario** | Son los mismos datos y ahora están enlazados: la fecha de inicio del plan es **obligatoria** (por defecto, el lunes de la semana siguiente); cada semana de «Plan y sesiones» muestra sus fechas y tiene **«Ver en el calendario»**; en el calendario, la sesión abierta tiene **«Ver en Plan y sesiones»**; las sesiones se ordenan por fecha y las que no tienen fecha se pueden colocar con un botón también desde el plan |
| **Euskera, ahora completo** | Traducidas todas las pantallas del entrenador: ficha del atleta (pestañas, creador y editor de plan, hitos, tests), calendario, fila de sesión, macrociclos y mesociclos, editor de plantillas, ejercicios, gráfico semanal, acceso protegido, estadísticas (nombres de disciplina), tipos de sesión sugeridos y los mesociclos que genera el plan nuevo (se crean en el idioma activo) |

## 2. Cómo aplicarla

1. Copia el contenido del zip encima del proyecto y haz commit y push.
2. **Supabase → SQL Editor:** ejecuta `supabase/migrations/0011_biblioteca_carpetas.sql` (idempotente; si ya la ejecutaste, no pasa nada).
   Sin ella la biblioteca funciona, pero sin carpetas, y avisa de que falta.
3. Espera al despliegue y abre la app con **Ctrl+F5** (o cierra del todo la PWA en el móvil).

## 3. Qué se ha verificado y qué no

Verificado:
- **59 tests** de la lógica pasan (con Node): zonas con ritmo y sin 220 − edad, anamnesis → perfil, errores de plantillas, enlace plan-calendario, registro del atleta…
- Sintaxis de los **30 archivos** JS/JSX cambiados desde la Fase 1 y todos los imports resueltos.
- **831 claves** idénticas en `es.js` y `eu.js` (mismos marcadores `{param}` en las dos); todas las claves `t('…')` del código existen, incluidas las que se construyen dinámicamente.

**No verificado** (sin red ni base de datos en el entorno donde se preparó):
- `npm run build` y el aspecto en pantalla. Revisa sobre todo: tabla de zonas, editor con ritmos, carpetas, selección de varios atletas, y los saltos Plan ↔ calendario.
- La migración 0011 en un Postgres real (tabla, políticas y trigger). Pruébala antes en un proyecto de pruebas si puedes.
- Aplicar a varios atletas con datos reales.
- La calidad del euskera: es una traducción mía. **Revísala tú** (son ~830 textos en `src/i18n/eu.js`); en especial tuteo/registro y términos como «Zain/Egiteke», «Sartu/Hasi saioa».

## 4. Avisos

- Las zonas ya guardadas siguen valiendo: el ritmo es opcional. `hr_zones.age` ya no se usa (no se borra).
- Si editas a mano un campo del perfil de un atleta, **se vuelve a rellenar** cuando el atleta guarde de nuevo su anamnesis.
- El atleta ya no edita FC de reposo ni FC máxima desde su perfil: las escribe el entrenador (o salen del test de umbrales).
- Los nombres por defecto de las plantillas nuevas («Mesociclo 1», «Bloque 1») siguen en castellano: son datos que el entrenador renombra y una parte de la lógica los reconoce.
- Las disciplinas creadas a mano en la base de datos se muestran con el nombre que les pusiste (solo las de serie están traducidas).
- Los textos legales ya tenían versión en euskera de antes; no los he tocado.

## 5. Pendiente (Fase 3)

Atleta sin plan y plan modificable por el atleta (cambiar objetivo, completar y reabrir), chat profesional (fotos, borrar mensajes),
skill de fuerza (falta el enlace), avisos y uso sin conexión.
