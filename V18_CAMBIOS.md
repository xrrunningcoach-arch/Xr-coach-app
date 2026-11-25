# V18: sincronización segura para el entrenador

La función `intervals-sync` acepta ahora una solicitud del entrenador únicamente para atletas activos asignados a su cuenta y solo si el entrenador está aprobado. La sincronización sigue usando el token de Intervals.icu del atleta, nunca el del entrenador. La pantalla Wellness del entrenador envía el `athlete_id` correspondiente y puede refrescar los datos.

## Despliegue
1. Publica esta carpeta en GitHub para crear el nuevo deployment de Vercel.
2. Desde PowerShell en esta carpeta, vincula el proyecto Supabase si hace falta y despliega:
   `npx supabase functions deploy intervals-sync`
3. No hay migración nueva.
4. Entra como entrenador aprobado, abre el atleta asignado y pulsa actualizar en Bienestar diario. Si aparece un error distinto, copia el texto exacto sin compartir tokens.
