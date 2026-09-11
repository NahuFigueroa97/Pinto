/**
 * Corta una promesa que no resuelve.
 *
 * Varias pantallas hacen `const { data } = await supabase...` y muestran un
 * spinner mientras `isLoading`. Si la petición nunca resuelve —no que falle,
 * que *se cuelgue*— react-query se queda en `pending` para siempre y el
 * usuario ve la ruedita girando sin ninguna explicación. Un error es
 * recuperable; un cuelgue silencioso no.
 */
export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`La consulta no respondió en ${Math.round(ms / 1000)} segundos`);
    this.name = 'TimeoutError';
  }
}

export function withTimeout<T>(promise: PromiseLike<T>, ms = 15_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
    Promise.resolve(promise).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}
