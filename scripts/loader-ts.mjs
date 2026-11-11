// Resuelve imports sin extension: src/lib los escribe asi porque Next los
// resuelve solo, y node no.
const EXTS = ['.ts', '.tsx', '.js', '/index.ts', '/index.js']
export async function resolve(specifier, context, next) {
  try { return await next(specifier, context) } catch (e) {
    for (const ext of EXTS) {
      try { return await next(specifier + ext, context) } catch { /* sigue */ }
    }
    throw e
  }
}
