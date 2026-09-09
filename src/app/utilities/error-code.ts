// Código de error de Postgres (o de PostgREST) de un error capturado en
// `catch (err: unknown)`. Los RPC de la spec 001 levantan códigos propios
// (VORA4…VORA8) justamente para que el cliente decida qué hacer sin tener que
// leer el texto del mensaje, que cambia.
export function errorCode(err: unknown): string | null {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code: unknown }).code;
    if (typeof code === 'string' && code.length > 0) return code;
  }
  return null;
}
