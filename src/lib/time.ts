// Todo el sistema opera en America/Argentina/Buenos_Aires (UTC-03:00, sin DST).
export const TIMEZONE = "America/Argentina/Buenos_Aires";
export const TZ_OFFSET = "-03:00";

/** Instante UTC real de una fecha+hora local de Buenos Aires. */
export function slotInstant(date: string, startTime: string): Date {
  const hhmm = startTime.slice(0, 5);
  return new Date(`${date}T${hhmm}:00${TZ_OFFSET}`);
}

/** Fecha actual (YYYY-MM-DD) en Buenos Aires. */
export function todayBA(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

/** ISO weekday 1..7 (lunes=1) de una fecha YYYY-MM-DD. */
export function isoWeekday(date: string): number {
  const d = new Date(`${date}T12:00:00${TZ_OFFSET}`);
  const js = d.getUTCDay(); // 0=domingo
  return js === 0 ? 7 : js;
}

export function isWeekend(date: string): boolean {
  return isoWeekday(date) > 5;
}

/** Horas que faltan para el turno, calculadas server-side. */
export function hoursUntil(date: string, startTime: string, now: Date = new Date()): number {
  return (slotInstant(date, startTime).getTime() - now.getTime()) / 3_600_000;
}

/** Fin del turno: 50 minutos de duración. */
export function endTimeOf(startTime: string): string {
  const [h, m] = startTime.slice(0, 5).split(":").map(Number);
  const total = (h ?? 0) * 60 + (m ?? 0) + 50;
  const hh = String(Math.floor(total / 60) % 24).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00${TZ_OFFSET}`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatDateLabel(date: string): string {
  const dias = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  const [y, m, d] = date.split("-");
  return `${dias[isoWeekday(date) - 1]} ${d}/${m}/${y}`;
}

export function hhmm(time: string): string {
  return time.slice(0, 5);
}
