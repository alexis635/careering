import { neon } from '@neondatabase/serverless';

let client: ReturnType<typeof neon> | null = null;

export function sql() {
  if (!client) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
    client = neon(process.env.DATABASE_URL);
  }
  return client;
}

export async function q<T = any>(text: string, params: any[] = []): Promise<T[]> {
  return (await sql()(text, params)) as T[];
}
