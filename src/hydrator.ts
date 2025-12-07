/**
 * ResultHydrator
 * 
 * Transforms flat database rows (from SQL JOINs) into nested JSON objects
 * based on column aliases (e.g. "author__name" -> author: { name: "..." })
 */
export class ResultHydrator {
  /**
   * Hydrate a list of flat database rows into nested objects.
   * @param rows Array of flat objects from the database driver
   */
  hydrate(rows: any[]): any[] {
    return rows.map(row => this.hydrateRow(row));
  }

  private hydrateRow(row: any): any {
    const result: any = {};

    for (const key of Object.keys(row)) {
      const value = row[key];
      
      if (key.includes('__')) {
        // Handle nested property: "author__name" -> author: { name: "..." }
        const parts = key.split('__');
        let current = result;

        for (let i = 0; i < parts.length - 1; i++) {
          const part = parts[i];
          if (!current[part]) {
            current[part] = {};
          }
          current = current[part];
        }

        const lastPart = parts[parts.length - 1];
        current[lastPart] = value;
      } else {
        // Simple property
        result[key] = value;
      }
    }

    return result;
  }
}
