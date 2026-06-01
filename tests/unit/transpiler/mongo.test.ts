import { MongoTranspiler } from '../../../src/transpiler';

describe('MongoTranspiler where operators', () => {
  const transpiler = new MongoTranspiler();

  it('maps not to $nor', () => {
    const result = transpiler.transpile({ where: { not: { status: { eq: 'active' } } } }, 'users');
    expect(result.filter).toEqual({ $nor: [{ status: 'active' }] });
  });

  it('maps nin to $nin', () => {
    const result = transpiler.transpile({ where: { id: { nin: [2] } } }, 'users');
    expect(result.filter).toEqual({ id: { $nin: [2] } });
  });

  it('escapes regex metacharacters for contains/starts/ends', () => {
    const contains = transpiler.transpile({ where: { name: { contains: 'a.b*' } } }, 'users');
    expect((contains.filter.name as Record<string, unknown>).$regex).toBe('a\\.b\\*');

    const starts = transpiler.transpile({ where: { name: { starts: 'a.' } } }, 'users');
    expect((starts.filter.name as Record<string, unknown>).$regex).toBe('^a\\.');

    const ends = transpiler.transpile({ where: { name: { ends: '.b' } } }, 'users');
    expect((ends.filter.name as Record<string, unknown>).$regex).toBe('\\.b$');
  });
});
