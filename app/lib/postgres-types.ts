import pg from "pg";

export const postgresTypes: NonNullable<pg.PoolConfig["types"]> = {
  getTypeParser: (oid, format) => {
    // SQL DATE has no timezone; keep its YYYY-MM-DD representation for date inputs.
    if (oid === 1082 && format !== "binary") return (value: string) => value;
    return pg.types.getTypeParser(oid, format);
  },
};
