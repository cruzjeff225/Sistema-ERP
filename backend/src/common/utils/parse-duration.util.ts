/**
 * Convierte una duración tipo "15m", "7d", "30s" a milisegundos.
 * Soporta: s (segundos), m (minutos), h (horas), d (días).
 */
export function parseDurationToMs(duration: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(duration.trim());

  if (!match) {
    throw new Error(
      `Formato de duración inválido: "${duration}". Usa por ejemplo "15m", "7d".`,
    );
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const unitToMs: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return value * unitToMs[unit];
}
