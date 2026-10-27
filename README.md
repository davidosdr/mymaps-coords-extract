
# mymaps-coords-extract

Script de Tampermonkey/Violentmonkey que recorre los marcadores de un mapa de Google My Maps y los exporta a CSV con nombre y coordenadas. Pensado para cuando Google no quiere ofrecer productos de calidad y las soluciones de terceros son un robo.

## El problema

Google exporta el KML de una lista de lugares sin las etiquetas `<coordinates>`. Solo mete `<address>` con el texto de la dirección, no es un bug, es una decisión deliberada de Google para que My Maps no se use como geocodificador masivo gratuito.

Este script se salta el problema: usa el propio My Maps para leer las coordenadas que ya tiene calculadas internamente, y las exporta a un CSV.

## Cómo funciona

1. Itera sobre los elementos del listado lateral (`div[fl_id]`). Esos sí están en el DOM, no como los pines del mapa, que dependen del zoom y del encuadre.
2. A cada item le dispara la secuencia completa de eventos: `pointerdown`, `mousedown`, `pointerup`, `mouseup`, `click`. Un `.click()` normal no basta. My Maps escucha pointerdown/mousedown, y si solo le llega click, no abre el popup.
3. Lee el popup (`.gm-style-iw`) y saca lat/lng con dos regexes: una para decimales (`40.4567, -3.6789`) y otra para DMS (`40°27'24"N 3°40'44"W`).
4. Cuando se acaban los items visibles, hace scroll del panel lateral para que Google cargue los que tiene virtualizados. Gracias a esto se procesan todos los items aunque sean cientos
5. Genera un CSV `nombre,lat,lng,direccion`.

El bucle es adaptativo: en vez de esperar 900ms fijos por popup, hace polling cada 20ms y sigue en cuanto las coordenadas están disponibles. Con 570 items tarda menos de 3 minutos.

## Instalación

1. Instala [Tampermonkey](https://www.tampermonkey.net/) (Chrome/Edge) o [Violentmonkey](https://violentmonkey.github.io/) (Firefox).
2. Instálalo desde Greasyfork: [enlace].
3. Entra en [Google My Maps](https://www.google.com/maps/d), abre el mapa que quieras procesar.
4. **Asegúrate de que el panel lateral está abierto** con los bares listados. Si está colapsado, el script detecta 0 items.
5. Aparece un botón azul arriba a la derecha: "▶ Extraer v6". Púlsalo.

## Uso

- Al pulsar el botón, empieza a recorrer items. Puedes ver progreso en la consola (F12): cada 10 items imprime velocidad actual, fallos y las últimas coordenadas.
- El botón cambia a **STOP** mientras corre. Si algo va raro, un clic para y descarga lo que lleve procesado.
- Al terminar:
  - Descarga `bares_YYYY-MM-DD.csv`
  - Copia el mismo CSV al portapapeles
  - Muestra un alert con el resumen (procesados, sin coords, tiempo)
- Para comprobar el resultado:
  1. Abre tu mapa en My Maps.
  2. **"Añadir capa"** → nómbrala "Bares (coords exactas)".
  3. En esa capa, **Importar** → sube el CSV.
  4. En el asistente, elige **lat** y **lng** como columnas de posición (no la de dirección).
  5. Superpón las dos capas y alterna visibilidad. Los pines de la capa nueva deberían caer justo encima de los de la original (los geocodificados por dirección).
  6. Cuando confirmes que están bien, exporta ese My Maps a KML. Esa vez el KML **sí** incluirá `<coordinates>`, porque las posiciones vienen de lat/lng, no de dirección.
  7. Importa ese KML en cualquier aplicacion.
 
## Limitaciones

Este script esta hardcodeado a la ciudad de Madrid, regex filtra números que caigan entre 35° y 45° de latitud y menos de 15° de longitud. Es para      no confundir coordenadas con otros números del popup (CP, número de calle, códigos de encuesta). Para otra ciudad hay que tocar esa comprobación. Es una línea, sección `<extractCoords>`

## Formato del CSV

```csv
nombre,lat,lng,direccion
"3 Raíces",40.4567,-3.6789,"Calle Alberto Alcocer 47"
"Vía Castellana",40.4692,-3.6891,"Paseo de la Castellana 220"
