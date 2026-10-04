const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const idr = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});
const tokens = new Intl.NumberFormat('id-ID');

export const formatUsd = (value: number): string => usd.format(value);
export const formatIdr = (value: number): string => idr.format(value);
export const formatTokens = (value: number): string => tokens.format(value);

/** HH:MM in WIB. */
export function formatTimeWib(date: Date): string {
  return date.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  });
}

/** Tanggal + jam WIB, for timelines. */
export function formatDateTimeWib(date: Date): string {
  return date.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  });
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
