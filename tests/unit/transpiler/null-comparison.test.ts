import { SQLTranspiler } from '../../../src/transpiler';

describe('SQLTranspiler null comparison semantics', () => {
  const transpiler = new SQLTranspiler('postgres');

  it('maps eq null to IS NULL', () => {
    const { sql, parameters } = transpiler.transpile({ where: { age: { eq: null } } }, 'users');
    expect(sql).toContain('IS NULL');
    expect(parameters).not.toContain(null);
  });

  it('maps ne null to IS NOT NULL', () => {
    const { sql, parameters } = transpiler.transpile({ where: { age: { ne: null } } }, 'users');
    expect(sql).toContain('IS NOT NULL');
    expect(parameters).not.toContain(null);
  });

  it.each(['gt', 'gte', 'lt', 'lte'] as const)('does not collapse %s null into IS NULL', (op) => {
    const { sql, parameters } = transpiler.transpile({ where: { age: { [op]: null } } }, 'users');
    expect(sql).not.toContain('IS NULL');
    // Ordering comparison against NULL is parameterised (evaluates to UNKNOWN).
    expect(parameters).toContain(null);
  });
});
