import Benchmark from 'benchmark';
import { JSONQLParser } from '../src/parser/index.js';  // Adjust path

const parser = new JSONQLParser();
const complexQuery = {
  users: {
    fields: ['id', 'name', 'email'],
    where: { age: { gt: 18, lt: 65 }, status: 'active' },
    sort: [{ field: 'created_at', dir: 'desc' }],
    limit: 100,
    include: { posts: { fields: ['title', 'likes'] } }
  }
};

const suite = new Benchmark.Suite('Parser');
suite
  .add('JSONQL Parser (complex)', () => parser.parse(complexQuery))
  .add('JSON.parse baseline', () => JSON.parse(JSON.stringify(complexQuery)))
  .on('cycle', (event: Benchmark.Event) => console.log(String(event.target)))
  .on('complete', (event: Benchmark.Event) => console.log(`Fastest: ${(event.currentTarget as any).filter('fastest').map('name').join(', ')}`))
  .run({ async: true });
