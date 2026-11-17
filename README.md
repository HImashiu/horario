# Armador de Horarios · Uniandes

Arma tu horario semestral desde el pensum de **Ingeniería Mecánica** (134 créditos) o **Física** (128 créditos), busca secciones en vivo en `ofertadecursos.uniandes.edu.co` o importa el JSON de Banner, y compáralas en un calendario semanal.

- Pensum por semestre con botón "Agregar todo el semestre"
- Calendario semanal con detección de choques, arrastrar y soltar, y cambio de sección
- Varios horarios (borradores), deshacer/rehacer, comparación y score según tus restricciones
- Exportar a .txt, copiar resumen, imprimir
- Todo se guarda en el navegador (localStorage)

Es un sitio estático: abre `index.html` o publícalo con GitHub Pages (rama `main`, carpeta raíz).

## Desarrollo
Los estilos se compilan con Tailwind a `assets/app.css`. Si cambias clases en `index.html`:

```bash
./build.sh
```

> El pensum es el plan sugerido; verifica códigos y créditos de tu cohorte con la coordinación del programa.
