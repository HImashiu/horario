# Armador de Horarios · Uniandes

Arma tu horario semestral desde el **pénsum visual** de Ingeniería Mecánica, Física o Ingeniería Civil.

Proyecto estudiantil: no es un sitio oficial de la Universidad de los Andes.

## Cómo se usa
1. **Mi pénsum**: elige tu programa (y en Mecánica, la ruta Cálculo o Precálculo). Toca las materias que vas a ver: quedan en *Tu próximo semestre* y sus secciones se buscan solas en `ofertadecursos.uniandes.edu.co`. Pasa el mouse sobre una materia para ver qué pide y qué desbloquea; el botón «⋯» muestra sus detalles y, en las electivas, las opciones.
2. **Horario**: «Mis materias» muestra el estado de cada una (Completa, Falta complementaria, Sin elegir, Choque…). Abre una materia para elegir su combinación magistral + complementaria, o usa **Generar horarios** para ver todas las combinaciones sin choques, ordenadas según tus restricciones. Clic en un espacio vacío del calendario: «¿Qué cabe aquí?».
3. **Exportar**: compara tus horarios y copia los NRC para inscribirte.

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
- `src/core/`: lógica pura (horas y choques, magistral/complementaria, generador, score, requisitos, pénsum).
- `src/state/`: estado, guardado y migraciones. `src/storage/`: almacenamiento (localStorage hoy; listo para cambiar por un backend).
- `src/data/`: API de Uniandes, importación de JSON y datos demo.
- `src/ui/`: vistas (`views/`), calendario, diálogos, menús y avisos.
