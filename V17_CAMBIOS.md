# V17: Intervals.icu, actividad y navegación

## Cambios
- El refresco manual de Wellness fuerza una consulta nueva a Intervals.icu.
- Un fallo Wellness (403, red o escritura en base de datos) se muestra en la app y ya no se registra como sincronización correcta; así no se bloquean reintentos durante 12 horas.
- Abrir el análisis de una actividad vuelve a pedir la traza, incluso si anteriormente quedó guardada vacía. Los errores de autorización o traza inexistente se explican con su estado.
- En el entrenador, Calendario incorpora un selector para alternar entre Egutegia, Plan y Actividades.
- Plan y sesiones aparecen en orden descendente de semana y día.
- En el atleta, el selector de panel de Nire profila aparece sobre el contenido.

## Despliegue
No hay migración nueva respecto a V16. Para usar las mejoras:
1. Publica el contenido de esta carpeta en GitHub y deja que Vercel genere la nueva versión.
2. Desde PowerShell en esta carpeta, ejecuta:
   - `npx supabase link --project-ref TU_PROJECT_REF`
   - `npx supabase functions deploy intervals-sync`
   - `npx supabase functions deploy intervals-activity-detail`
   - `npx supabase functions deploy intervals-webhook`
3. Comprueba que en Intervals.icu la aplicación esté aprobada, tenga `ACTIVITY:READ,WELLNESS:READ`, y el webhook tenga `WELLNESS_UPDATED` y los tres eventos `ACTIVITY_*` que se usan.
4. Si haces clic en «Actualizar datos» y sale 403, vuelve a conectar Intervals.icu y acepta `WELLNESS:READ`.

## Secreto del webhook
Si usas el campo **Webhook Secret** de Intervals.icu, guarda exactamente ese valor en Supabase como `INTERVALS_WEBHOOK_SECRET`. No pongas `Bearer ` delante: esa palabra solo se usa si configuras **Webhook Authorization Header**, en cuyo caso el secreto de Supabase es `INTERVALS_WEBHOOK_AUTHORIZATION` y debe coincidir exactamente con la cabecera.
