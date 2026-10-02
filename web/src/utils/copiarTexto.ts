/**
 * Copia un texto al portapapeles, también desde el celular.
 *
 * `navigator.clipboard` solo existe en páginas seguras (https o localhost). Desde el celular
 * la app se abre por la IP de la PC (http://192.168.x.x), así que ahí se usa el método viejo:
 * un cuadro de texto invisible, se selecciona y se ejecuta "copiar".
 *
 * @returns true si se copió.
 */
export async function copiarTexto(texto: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {
      // Sigue con el método viejo.
    }
  }

  const cuadro = document.createElement("textarea");
  cuadro.value = texto;
  // readonly evita que se abra el teclado del celular; fuera de la pantalla para que no se vea.
  cuadro.setAttribute("readonly", "");
  cuadro.style.position = "fixed";
  cuadro.style.top = "-1000px";
  document.body.appendChild(cuadro);
  cuadro.select();
  cuadro.setSelectionRange(0, texto.length); // iPhone necesita el rango explícito
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(cuadro);
  }
}
