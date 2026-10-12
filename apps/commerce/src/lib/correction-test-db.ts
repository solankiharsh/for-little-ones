import type { Knex } from "knex";

/** Test-only database boundary. Models transactions and rows, not PostgreSQL lock semantics. */
export function correctionTestDb(initial: Record<string, Array<Record<string, any>>>) {
  const tables = structuredClone(initial);
  const db = ((table: string) => {
    const filters: Array<(row: Record<string, any>) => boolean> = [];
    let count = false;
    let sort: { key: string; direction: string } | undefined;
    const rows = () => {
      const selected = (tables[table] ?? []).filter((row) => filters.every((test) => test(row)));
      return sort ? selected.sort((a, b) => (a[sort!.key] > b[sort!.key] ? 1 : -1) * (sort!.direction === "desc" ? -1 : 1)) : selected;
    };
    const query: any = {
      where(input: Record<string, unknown> | string, operator?: string, value?: unknown) {
        filters.push(typeof input === "string" ? (row) => operator === ">" ? new Date(row[input]).getTime() > new Date(value as Date).getTime() : new Date(row[input]).getTime() <= new Date(value as Date).getTime()
          : (row) => Object.entries(input).every(([key, expected]) => row[key] === expected)); return query;
      },
      whereNull(key: string) { filters.push((row) => row[key] == null); return query; },
      forUpdate() { return query; },
      orderBy(key: string, direction = "asc") { sort = { key, direction }; return query; },
      count() { count = true; return query; },
      first() { return Promise.resolve(count ? { count: String(rows().length) } : rows()[0]); },
      async delete() { const selected = rows(); tables[table] = (tables[table] ?? []).filter((row) => !selected.includes(row)); return selected.length; },
      async insert(row: Record<string, any>) { (tables[table] ??= []).push({ created_at: new Date(), ...structuredClone(row) }); },
      async update(values: Record<string, any>) {
        const selected = rows();
        for (const row of selected) Object.assign(row, Object.fromEntries(Object.entries(values).map(([key, value]) => [key, ["story", "generation_metadata"].includes(key) && typeof value === "string" ? JSON.parse(value) : value])));
        return selected.length;
      },
      then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) { return Promise.resolve(rows()).then(resolve, reject); }
    };
    return query;
  }) as unknown as Knex;
  db.fn = { now: () => new Date() } as unknown as Knex.FunctionHelper;
  db.transaction = (async (run: (tx: Knex) => Promise<unknown>) => {
    const before = structuredClone(tables);
    try { return await run(db); } catch (error) { for (const key of Object.keys(tables)) delete tables[key]; Object.assign(tables, before); throw error; }
  }) as Knex["transaction"];
  return db;
}
