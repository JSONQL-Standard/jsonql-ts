import express from 'express';
import { jsonqlExpress, ResultHydrator } from '@jsonql-standard/jsonql-ts';
import { DBAdapter } from '../db';

export async function startExpressServer(db: DBAdapter, port: number) {
  const app = express();
  app.use(express.json());

  const hydrator = new ResultHydrator();

  // Middleware
  app.use(jsonqlExpress());

  // Generic Endpoint
  app.all('/:resource', async (req: any, res: any) => {
    try {
      const resource = req.params.resource;
      const query = req.jsonql;

      if (!query) {
        return res.status(400).json({ error: 'No JSONQL query found' });
      }

      console.log(`[Express] Executing query on ${resource}`);

      const { sql, parameters } = db.transpiler.transpile(query, resource);
      const rows = await db.query(sql, parameters);
      const data = hydrator.hydrate(rows);

      res.json({ data });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.listen(port, () => {
    console.log(`Compliance Server (Express) running on http://localhost:${port}`);
  });
}
