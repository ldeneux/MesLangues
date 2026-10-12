// Partie commune entre la forme du dictionnaire et une forme conjuguée : le reste (la terminaison qui change)
// est mis en couleur à l'écran. Module pur.
export function splitCommon(base: string, form: string): { stem: string; rest: string } {
  let i = 0;
  while (i < base.length && i < form.length && base[i] === form[i]) i++;
  return { stem: form.slice(0, i), rest: form.slice(i) };
}
