import Benchmark from 'benchmark';
import { SQLTranspiler } from '../src/transpiler/index.js';

const transpiler = new SQLTranspiler('postgres');
const query = { users: { fields: ['*'], where: { age: { gt: 18 } }, include: { posts: { fields: ['title'] } } } };
const schema = { tables: { users: { fields: { id: { type: 'int' } }, relations: { posts: { type: 'hasMany' } } } } };  // Stub

const suite = new Benchmark.Suite('Transpiler');
suite
  .add('SQL Transpile (JOIN)', () => transpiler.transpile(query, 'users', schema))
  .add('Simple SELECT baseline', () => transpiler.transpile({ users: { fields: ['id'] } }, 'users'))
  .on('cycle', (event: Benchmark.Event) => console.log(String(event.target)))
  .run({ async: true });
