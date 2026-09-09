# NNN — Nombre de la funcionalidad

> Copiar este archivo como `docs/specs/NNN-nombre-de-la-funcionalidad.md` (siguiente número disponible) al arrancar una funcionalidad nueva. Completar todas las secciones antes de empezar a programar; "Dudas abiertas" puede quedar con ítems pendientes sin bloquear el resto del documento.

## Contexto

Qué problema existe hoy, por qué se aborda ahora, y qué resultado se espera. 2-4 párrafos. Sin detalle de implementación todavía.

## Usuarios

Qué roles/personas interactúan con esta funcionalidad y qué necesitan de ella (`super_admin`, `admin`, `caja`, cliente final, etc.).

## Historias de usuario

Formato: *Como \<rol\>, quiero \<acción\>, para \<beneficio\>.*

- Como ..., quiero ..., para ...

## Requisitos funcionales (RF-x)

Notación EARS. Cada requisito es una sola oración verificable, numerada `RF-1`, `RF-2`, ...

- **Ubicuo**: `EL SISTEMA DEBERÁ <comportamiento siempre activo>`
- **Evento**: `CUANDO <disparador>, EL SISTEMA DEBERÁ <respuesta>`
- **Estado**: `MIENTRAS <estado activo>, EL SISTEMA DEBERÁ <respuesta>`
- **No deseado**: `SI <condición>, ENTONCES EL SISTEMA DEBERÁ <respuesta>`
- **Opcional**: `DONDE <feature incluida/configurada>, EL SISTEMA DEBERÁ <respuesta>`

**RF-1**: ...
**RF-2**: ...

## Casos límite

Situaciones de borde que los RF de arriba deben seguir cubriendo (condiciones de carrera, datos vacíos/nulos, offline, permisos cruzados, límites de plan/suscripción, etc.). Lista, no prosa.

## Fuera de alcance

Qué NO incluye esta versión de la funcionalidad, aunque esté relacionado. Si algo queda para una spec futura, nombrarla (`0XX-...`).

## Criterios de finalización

Checklist verificable de "esto está terminado": migraciones aplicadas, RPCs/servicios/UI implementados, tests que cubren la lógica crítica, prueba manual end-to-end en navegador, documentación/memoria actualizada si hubo decisiones de producto nuevas.

## Dudas abiertas

Preguntas sin resolver al momento de escribir la spec. Está bien dejar ítems acá — se resuelven durante la implementación o en una conversación de seguimiento, no bloquean el documento.
