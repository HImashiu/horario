# Armador de Horarios · Uniandes

Arma tu horario semestral desde el **pénsum visual** de Ingeniería Mecánica, Física o Ingeniería Civil.

Proyecto estudiantil: no es un sitio oficial de la Universidad de los Andes.

## Cómo se usa
1. **Mi pénsum**: elige tu programa (y en Mecánica, la ruta Cálculo o Precálculo).
   - En **«Ya aprobé»** marca lo que aprobaste: sus prerrequisitos se marcan solos y lo bloqueado se ve con candado.
   - En **«Próximo semestre»** toca las materias que vas a ver: sus correquisitos se agregan solos y sus secciones se buscan en `ofertadecursos.uniandes.edu.co`.
   - «Sugerir mi semestre» propone materias hasta tu meta de créditos.
   - **«Te graduarías en…»** abre tu plan semestre a semestre con los créditos que quieras por semestre. Muestra qué materias marcan el ritmo y qué requisitos debes cumplir antes (por ejemplo, el de lectura en inglés).
   - En Ingeniería Civil, elige tu énfasis para ver solo sus electivas.
2. **Horario**: «Mis materias» muestra el estado de cada una (Completa, Falta complementaria, Sin elegir, Choque…).
   - Abre una materia para elegir su combinación magistral + complementaria.
   - O usa **Generar horarios** y elige en la galería de opciones sin choques.
   - En **Preferencias** van tus días libres, tu rango de horas y tus horas ocupadas.
   - Si una sección está llena, toca la campana: te avisamos cuando se abra un cupo. La página revisa cada pocos minutos mientras está abierta; no hay servidor.
3. **Amigos**: comparte tu horario con un link (o como imagen) y guarda el de tus amigos. Desde ahí puedes:
   - Ver sus horarios superpuestos en el tuyo.
   - Encontrar huecos y clases en común.
   - Buscar secciones para ver materias juntos (**Armar juntos**).

   No hay cuentas ni servidor: el horario viaja dentro del link y todo queda en tu navegador.
4. **Exportar**: compara tus horarios y copia los NRC para inscribirte.
   - **«Agregar al calendario»** descarga un archivo .ics para Google Calendar, Outlook o el celular: una clase semanal entre el primer y el último día de clases, sin festivos de Colombia ni la semana de receso.

Si la búsqueda falla (bloqueo del navegador o sin conexión), en «Buscar» puedes importar el JSON de Banner o cargar datos demo.

## Pénsums
Transcritos de los PDF oficiales a `data/pensums/*.json` (fuente y fecha de consulta en cada archivo):

| Programa | Versión | Créditos |
| --- | --- | --- |
| Ingeniería Mecánica | Plan de estudios 2026-20 (rutas Cálculo y Precálculo) | 134 |
| Física | Pensum sugerido 2026 | 128 |
| Ingeniería Civil | Currículo sugerido 2026-2 | 134 |

Cada archivo tiene una lista `review` con las partes del PDF que fueron ambiguas y cómo se interpretaron. Verifica tu plan con la coordinación de tu programa.

## Magistral ↔ complementaria
- Una complementaria pertenece a la magistral cuyo número de sección es su prefijo más largo (S4 → S41, S42).
- Elegir una complementaria de otra magistral cambia también la magistral (con Deshacer).
- Si tus datos no siguen ese patrón, desactiva «Exigir que la complementaria sea de su magistral» en Restricciones.

Todo se guarda en el navegador (localStorage, misma llave que v7; los datos de v7 se migran solos y se guarda una copia de respaldo).

## Desarrollo
El código está en módulos (`src/`) y se empaqueta en `assets/app.js`; los estilos se compilan con Tailwind a `assets/app.css`. Ambos archivos se suben al repo para que GitHub Pages funcione sin compilar.

```bash
npm install
./build.sh          # compila assets/app.js y assets/app.css
npm test            # pruebas unitarias (incluye comparación contra v7)
npm run validate    # revisa los pénsums (créditos, códigos, ciclos)
npm run e2e         # prueba de punta a punta en Chromium (Playwright)
```

Estructura:
- `src/core/`: lógica pura (horas y choques, magistral/complementaria, generador, score, requisitos, pénsum, plan de grado, calendario .ics, alertas de cupo).
- `src/state/`: estado, guardado y migraciones. `src/storage/`: almacenamiento (localStorage hoy; listo para cambiar por un backend).
- `src/data/`: API de Uniandes, importación de JSON y datos demo.
- `src/ui/`: vistas (`views/`), calendario, diálogos, menús y avisos.
