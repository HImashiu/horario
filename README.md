# Armador de Horarios · Uniandes

Arma tu horario semestral desde el pensum de **Ingeniería Mecánica** (134 créditos) o **Física** (128 créditos).

Publicado en: https://juans314arango-lab.github.io/horario/

## Flujo en 3 pasos
1. **Materias** — marca varias materias de tu pensum y agrégalas de una vez; busca otras en `ofertadecursos.uniandes.edu.co` o importa el JSON de Banner.
2. **Horario** — "Mis materias" muestra el estado de cada una (Completa, Falta complementaria, Sin elegir, Choque, Sin secciones). Abre una materia para elegir:
   - **Combinaciones**: parejas válidas magistral + complementaria con mini-vista de la semana.
   - **Por sección**: cada magistral con sus complementarias debajo.
   - Pasa el mouse (o toca) para ver la **vista previa** en el calendario; las demás opciones de la materia aparecen como contornos punteados y se eligen con un clic.
   - **Generar horarios** arma todas las combinaciones sin choques, respetando candados y restricciones, y las ordena por score.
3. **Comparar y exportar** — compara tus horarios y copia los NRC para inscribirte.

## Magistral ↔ complementaria
- Una complementaria pertenece a la magistral cuyo número de sección es su prefijo más largo (S4 → S41, S42).
- Elegir una complementaria de otra magistral cambia también la magistral (con Deshacer).
- Cambiar a una magistral incompatible quita la complementaria; quitar la magistral quita su complementaria.
- Si tus datos no siguen ese patrón, desactiva "Exigir que la complementaria sea de su magistral" en Restricciones.

Todo se guarda en el navegador (localStorage). Es un sitio estático: abre `index.html` o publícalo con GitHub Pages.

## Desarrollo
Los estilos se compilan con Tailwind a `assets/app.css`. Si cambias clases en `index.html`:

```bash
./build.sh
```

> El pensum es el plan sugerido; verifica códigos y créditos de tu cohorte con la coordinación del programa.
