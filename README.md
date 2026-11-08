# Visor UAF — Inzá, ZRC Montaña Caucana

Visor cartográfico interactivo para la comparación de superficie predial y valores de la Unidad Agrícola Familiar (UAF) de referencia, desarrollado con HTML, CSS, JavaScript y [Leaflet](https://leafletjs.com/).

## Funciones

- Mapa temático con clasificación por relación área predial–UAF y opciones de simbología.
- Comparador sincronizado: predios clasificados por rangos de superficie (izquierda) y valores UAF territoriales (derecha).
- Filtros por relación de superficies y veredas de Inzá.
- Búsqueda por código predial y ficha informativa al seleccionar polígonos.
- Capas complementarias y fondos disponibles en línea, con atribución de sus proveedores.

## Publicación en GitHub Pages

El directorio raíz de este proyecto contiene `index.html`, `css/`, `js/`, `data/` y `.nojekyll`. No necesita Python en el servidor ni compilación: elegir `main` y `/(root)` como fuente en **Settings → Pages**.

## Datos

La distribución pública fue limitada a información del visor correspondiente a Inzá:

- Predios rurales: **5240** registros con referencia territorial de UAF en Inzá.
- Unidades UAF publicadas: **48** polígonos.
- Etiquetas UAF: **48**.
- Límites veredales: **55** polígonos con municipio Inzá.
- Posibles baldíos intersectados con la UAF de Inzá: **6**.

Los archivos originales de recuperación y las tablas diagnósticas completas **no** se publican aquí. El código fuente permite consultar los códigos prediales y las geometrías incluidas; revisar la autorización para divulgarlos antes de hacer público el sitio.

**Lectura de datos:** los valores de UAF son de referencia y la asociación predio–unidad territorial procede de un análisis espacial preliminar. No constituye por sí sola una determinación de cumplimiento de normativa agraria.

## Recursos externos

Leaflet se carga desde un CDN. Los mapas base dependen de sus proveedores (Esri World Imagery, OpenStreetMap y NIMBO), requieren conexión y pueden estar sujetos a políticas de acceso, disponibilidad, atribución y uso.

La publicación del código del visor no implica cesión de derechos sobre las fuentes de datos de terceros. Verificar las condiciones de uso de las capas y las imágenes base antes de difundir el proyecto.
