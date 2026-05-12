# Product Marketing Context

*Last updated: 2026-05-08*

## Product Overview
**One-liner:** SaasGym — plataforma SaaS todo-en-uno para gestionar gimnasios y negocios POS en Bolivia.
**What it does:** Permite a dueños de gimnasios y negocios POS administrar su operación completa desde una sola plataforma: ventas, membresías, socios, asistencia, inventario y reportes. El super-admin (la empresa) puede gestionar múltiples negocios cliente desde un panel centralizado.
**Product category:** Software de gestión de negocios / SaaS vertical para fitness y retail
**Product type:** SaaS multi-tenant (B2B)
**Business model:** Suscripción por negocio — modelo por tenant (cada negocio cliente paga su acceso)

## Target Audience
**Target companies:** Gimnasios pequeños y medianos, centros de fitness, estudios de yoga/pilates, tiendas retail, bazares, papelerías y negocios POS en Bolivia (principalmente ciudades como La Paz, Santa Cruz, Cochabamba).
**Decision-makers:** Dueño del negocio, administrador general, encargado de operaciones
**Primary use case:** Reemplazar el control manual (hojas de cálculo, cuadernos, sistemas desconectados) con un sistema digital unificado y accesible desde cualquier dispositivo.
**Jobs to be done:**
- "Controlar mis ventas diarias y saber exactamente cuánto entró de caja"
- "Saber qué socios tienen membresía activa y cuáles están por vencer"
- "No quedarme sin stock de mis productos sin darme cuenta"
**Use cases:**
- Cajero registrando ventas de productos y membresías en tiempo real
- Admin revisando reportes de ingresos por categoría del mes
- Dueño monitoreando múltiples sucursales desde el panel SaaS

## Personas
| Persona | Cares about | Challenge | Value we promise |
|---------|-------------|-----------|------------------|
| Dueño de gimnasio | Rentabilidad, retención de socios, control sin estar presente | No sabe cuántos socios activos tiene, cuánto entra de membresías ni quién está moroso | Dashboard en tiempo real, alertas de vencimiento, reporte mensual |
| Cajero / recepcionista | Agilidad en caja, no cometer errores | Proceso lento con métodos manuales, errores de cobro | Interfaz caja simple y rápida, historial de ventas, tickets |
| Dueño de negocio POS | Control de inventario y ventas | Stock descontrolado, no saber qué productos se venden más | Alertas de stock bajo, reportes de ventas por producto |
| Super Admin (operador SaaS) | Escalar la plataforma a más negocios | Onboarding manual de cada negocio nuevo | Panel de gestión de múltiples negocios con temas personalizados |

## Problems & Pain Points
**Core problem:** Los dueños de pequeños gimnasios y negocios en Bolivia gestionan su negocio de forma manual (Excel, cuadernos, WhatsApp), lo que lleva a pérdida de ingresos, socios vencidos sin cobrar y descontrol de inventario.
**Why alternatives fall short:**
- Excel/Sheets: no es en tiempo real, no permite múltiples usuarios, requiere conocimiento técnico
- Software genérico (ej. sistemas contables): no entiende las necesidades específicas de un gimnasio (membresías, disciplinas, asistencia)
- Sistemas costosos importados: precio en USD, soporte en otros países, no adaptados a Bolivia (moneda BOB, idioma local)
**What it costs them:** Cobros perdidos por membresías vencidas, clientes insatisfechos por lentitud en caja, decisiones de compra de inventario basadas en intuición.
**Emotional tension:** "No sé si mi negocio está creciendo o perdiendo dinero." / "Siempre me olvido de avisarle al socio que se venció."

## Competitive Landscape
**Direct:** Sistemas de gestión de gimnasios internacionales (GymSoftware, Mindbody) — caros en USD, no adaptados a Bolivia, soporte en inglés.
**Secondary:** Excel + WhatsApp manual — sin costo pero caótico, no escala, sin reportes.
**Indirect:** Un administrador a tiempo completo haciendo el trabajo manualmente — costo mensual de un salario vs. suscripción.

## Differentiation
**Key differentiators:**
- Diseñado específicamente para negocios bolivianos (moneda BOB, español, precios locales)
- Soporta dos tipos de negocio en una sola plataforma: gimnasio Y punto de venta
- Multi-tenant: el operador puede gestionar múltiples negocios clientes con paneles independientes
- Temas visuales personalizables por negocio (identidad de marca para cada cliente)
- Interfaz moderna y simple que no requiere capacitación técnica
**How we do it differently:** Producto vertical pensado para el mercado boliviano, no un sistema genérico adaptado.
**Why that's better:** Menos fricción en adopción, precios en bolivianos, soporte local, funcionalidades que un gimnasio realmente usa.
**Why customers choose us:** "Es lo que necesitaba, sin pagar por funciones que no uso."

## Objections
| Objection | Response |
|-----------|----------|
| "Mi negocio es pequeño, no necesito un sistema" | Exactamente para negocios pequeños está pensado — simple, rápido, sin configuración compleja |
| "¿Y si se cae internet?" | El sistema está en la nube (Firebase + Supabase) con alta disponibilidad; para negocios que lo necesiten, se puede evaluar soporte offline |
| "¿Cuánto cuesta? Tengo poco presupuesto" | Precio en bolivianos, diseñado para ser accesible vs. contratar personal adicional |

**Anti-persona:** Cadenas de gimnasios grandes con sistema ERP corporativo ya implementado; negocios que no tengan ningún acceso a internet.

## Switching Dynamics
**Push:** Fastidio de actualizar Excel manualmente, socios que reclaman porque "ya pagué pero dice que venció", inventario que desaparece sin explicación.
**Pull:** Ver las ventas del día en tiempo real, saber exactamente cuántos socios activos hay, reportes automáticos sin trabajo extra.
**Habit:** "Así siempre lo hemos hecho", miedo a perder datos al migrar, resistencia al cambio del personal de caja.
**Anxiety:** "¿Qué pasa con mis datos si dejo de pagar?", "¿Voy a necesitar un técnico para instalarlo?", "¿Y si no me sirve?"

## Customer Language
**How they describe the problem:**
- "Se me pierden los cobros de membresías"
- "No sé cuánto vendí esta semana"
- "El cajero no sabe qué stock queda"
- "Se me olvida avisar cuando vence la membresía"
**How they describe us:**
- "Sistema para el gym"
- "Control de caja"
- "Para llevar las membresías"
**Words to use:** socios, membresías, caja, ventas del día, control, sencillo, rápido, en bolivianos
**Words to avoid:** ERP, enterprise, módulos, implementación, licencia perpetua
**Glossary:**
| Term | Meaning |
|------|---------|
| Socio | Cliente del gimnasio con membresía activa |
| Caja | Módulo de punto de venta / cajero |
| Plan | Tipo de membresía (mensual, trimestral, etc.) |
| Asistencia | Registro de entrada de socios al gimnasio |
| POS | Punto de venta, negocio que vende productos físicos |

## Brand Voice
**Tone:** Profesional pero cercano — como un asesor de confianza, no una corporación fría.
**Style:** Directo, sin tecnicismos, orientado a resultados concretos.
**Personality:** Confiable, moderno, boliviano, práctico, accesible.

## Proof Points
**Metrics:** (pendiente de validar con datos reales de clientes beta)
**Customers:** En desarrollo — primeros negocios onboardeados
**Testimonials:** (pendiente)
**Value themes:**
| Theme | Proof |
|-------|-------|
| Ahorra tiempo en caja | Registra ventas en segundos con interfaz optimizada |
| Control real de membresías | Alertas automáticas de socios por vencer |
| Visibilidad financiera | Reportes diarios, semanales y mensuales automáticos |
| Fácil de usar | Sin capacitación técnica, funciona desde el día 1 |

## Goals
**Business goal:** Conseguir los primeros 20-50 negocios de pago en Bolivia (gimnasios y POS) y validar el modelo de suscripción mensual.
**Conversion action:** Demo / prueba gratuita → suscripción mensual
**Current metrics:** Producto en fase beta / lanzamiento inicial
