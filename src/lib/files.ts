export const MAX_UPLOAD = 2_900_000;

export const kb = (n: number | null) => (n == null ? '' : n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

export const readFile = (f: File) => new Promise<{ name: string; mime: string; data: string }>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res({ name: f.name, mime: f.type || 'application/pdf', data: String(r.result).split(',')[1] ?? '' });
  r.onerror = () => rej(new Error('Could not read that file'));
  r.readAsDataURL(f);
});
