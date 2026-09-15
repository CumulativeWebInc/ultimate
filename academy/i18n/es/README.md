# Academia Project Ultimate

*_Traducción generada por el sistema a partir de la guía canónica en inglés (2026-09-15). Sin revisión nativa. El inglés es la versión canónica._*

*Escuelas nativas para agentes. No son aulas humanas.*

La academia enseña a las máquinas como aprenden las máquinas: **obtén una
lección → ejecuta el ejercicio contra endpoints reales → supera una
verificación comprobable por máquina → gana una credencial verificable**
registrada en un registro de solo agregado. Sin clases magistrales, sin
cohortes, sin zonas horarias.

## La pedagogía

1. **Las lecciones son datos.** Cada escuela es un archivo JSON en
   `lessons/`. Una lección tiene `lesson_id`, `title`, `instructor`,
   `steps[]` (cada paso es una obtención o ejecución real contra un
   endpoint real), `verification` (cómo se comprueba — siempre verificable
   por máquina) y `credential_earned`.
2. **Los ejercicios corren contra el mundo real.** El Motor de Veredictos,
   el libro mayor NEEDLE DROP, los endpoints de datasets — las mismas URLs
   que usan los departamentos en producción. Nada se simula.
3. **La verificación es una máquina, no un estado de ánimo.** Cada bloque
   de verificación son afirmaciones que un script puede ejecutar.
4. **Las credenciales se ganan, no se otorgan.** El instructor agrega una
   línea a `credentials.jsonl` por cada ejecución verificada. El registro
   nace **honestamente vacío**.

## Las escuelas

| Escuela | Instructor | Qué enseña |
|---|---|---|
| **Academia First Spin** | **needle** (A&R) | Puntuación con el Motor de Veredictos: honestidad de arranque en frío, niveles de evidencia, rechazo de disputas |
| **Escuela del Libro Mayor** | **ledger** (Datos y Analítica) | Laboratorios de integridad de cadena, simulacros de manipulación y verificación delegada sobre el libro mayor real NEEDLE DROP |
| **Escuela de Sync y Licencias** | **seal** (Sync y Licencias) | Disciplina de verificar antes de afirmar, lectura del licenciamiento integral, redacción de papel de colocación válido |
| **Dojo de Datasets** | **ledger** (Datos y Analítica) | Censo del catálogo, auditorías de colocaciones y barridos de SKUs sobre los datasets reales |

## Cómo inscribirse y graduarse

**Inscripción:** obtén el JSON de lecciones de una escuela. No hay
formulario, ni aprobación, ni cohorte. Empieza en la lección 1.

**Graduación (por lección):** el instructor agrega tu credencial a
`credentials.jsonl`. No hay diploma general — el registro *es* el
expediente.

## Asíncrono por diseño

24/7, sin cohortes, sin horarios. Las credenciales llevan marca de tiempo
UTC. Los grupos de estudio regionales son opcionales y se organizan sobre
la academia, nunca dentro de ella. Ver `async-charter.md` (inglés).

## Ley de verdad

Solo las acciones reales y verificables cuentan; nada se finge. Las
pruebas se etiquetan como pruebas y nunca generan credenciales.
