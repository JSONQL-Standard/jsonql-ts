import {
  JSONQLQueryBuilder,
  field,
  eq,
  ne,
  gt,
  gte,
  lt,
  lte,
  inArray,
  nin,
  contains,
  starts,
  ends,
  fieldRef,
  and,
  or,
  not,
} from '../builder';

describe('JSONQLQueryBuilder', () => {
  let builder: JSONQLQueryBuilder;

  beforeEach(() => {
    builder = new JSONQLQueryBuilder();
  });

  describe('basic building', () => {
    it('should build a minimal query', () => {
      const query = builder.build();

      expect(query.version).toBe('1.0');
    });

    it('should build query with fields', () => {
      const query = builder.fields('id', 'name', 'email').build();

      expect(query.fields).toEqual(['id', 'name', 'email']);
    });

    it('should build query with single where condition', () => {
      const query = builder.where(field('age', gt(18))).build();

      expect(query.where).toEqual({
        age: { gt: 18 },
      });
    });

    it('should build query with sort', () => {
      const query = builder.sort('name', '-created_at').build();

      expect(query.sort).toEqual(['name', '-created_at']);
    });

    it('should build query with single sort', () => {
      const query = builder.sort('name').build();

      expect(query.sort).toBe('name');
    });

    it('should build query with limit', () => {
      const query = builder.limit(10).build();

      expect(query.limit).toBe(10);
    });

    it('should build query with skip', () => {
      const query = builder.skip(20).build();

      expect(query.skip).toBe(20);
    });

    it('should build query with include', () => {
      const query = builder.include('author', 'tags').build();

      expect(query.include).toEqual(['author', 'tags']);
    });
  });

  describe('where conditions', () => {
    it('should build query with andWhere', () => {
      const query = builder
        .where(field('age', gte(18)))
        .andWhere(field('status', eq('active')))
        .build();

      expect((query.where as any).and).toHaveLength(2);
    });

    it('should build query with orWhere', () => {
      const query = builder
        .where(field('role', eq('admin')))
        .orWhere(field('role', eq('moderator')))
        .build();

      expect((query.where as any).or).toHaveLength(2);
    });
  });

  describe('helper functions', () => {
    it('should create eq condition', () => {
      const condition = eq('active');
      expect(condition).toEqual({ eq: 'active' });
    });

    it('should create ne condition', () => {
      const condition = ne('deleted');
      expect(condition).toEqual({ ne: 'deleted' });
    });

    it('should create gt condition', () => {
      const condition = gt(18);
      expect(condition).toEqual({ gt: 18 });
    });

    it('should create gte condition', () => {
      const condition = gte(18);
      expect(condition).toEqual({ gte: 18 });
    });

    it('should create lt condition', () => {
      const condition = lt(100);
      expect(condition).toEqual({ lt: 100 });
    });

    it('should create lte condition', () => {
      const condition = lte(100);
      expect(condition).toEqual({ lte: 100 });
    });

    it('should create in condition', () => {
      const condition = inArray([1, 2, 3]);
      expect(condition).toEqual({ in: [1, 2, 3] });
    });

    it('should create nin condition', () => {
      const condition = nin(['spam', 'deleted']);
      expect(condition).toEqual({ nin: ['spam', 'deleted'] });
    });

    it('should create contains condition', () => {
      const condition = contains('john');
      expect(condition).toEqual({ contains: 'john' });
    });

    it('should create starts condition', () => {
      const condition = starts('admin');
      expect(condition).toEqual({ starts: 'admin' });
    });

    it('should create ends condition', () => {
      const condition = ends('@example.com');
      expect(condition).toEqual({ ends: '@example.com' });
    });

    it('should create field reference', () => {
      const ref = fieldRef('author.created_at');
      expect(ref).toEqual({ field: 'author.created_at' });
    });

    it('should create AND condition', () => {
      const condition = and(field('age', gte(18)), field('status', eq('active')));

      expect(condition).toEqual({
        and: [{ age: { gte: 18 } }, { status: { eq: 'active' } }],
      });
    });

    it('should create OR condition', () => {
      const condition = or(field('role', eq('admin')), field('role', eq('moderator')));

      expect(condition).toEqual({
        or: [{ role: { eq: 'admin' } }, { role: { eq: 'moderator' } }],
      });
    });

    it('should create NOT condition', () => {
      const condition = not(field('status', eq('deleted')));

      expect(condition).toEqual({
        not: { status: { eq: 'deleted' } },
      });
    });
  });

  describe('complex queries', () => {
    it('should build a complex query', () => {
      const query = builder
        .fields('id', 'name', 'email')
        .where(
          and(
            field('age', gte(18)),
            or(field('role', eq('admin')), field('email', ends('@company.com'))),
          ),
        )
        .sort('name', '-created_at')
        .limit(10)
        .skip(0)
        .include('posts', 'profile')
        .build();

      expect(query.version).toBe('1.0');
      expect(query.fields).toEqual(['id', 'name', 'email']);
      expect(query.where).toBeDefined();
      expect(query.sort).toEqual(['name', '-created_at']);
      expect(query.limit).toBe(10);
      expect(query.skip).toBe(0);
      expect(query.include).toEqual(['posts', 'profile']);
    });

    it('should build query with field-to-field comparison', () => {
      const query = builder.where(field('price', gt(fieldRef('cost')))).build();

      expect(query.where).toEqual({
        price: { gt: { field: 'cost' } },
      });
    });

    it('should build query with nested field comparison', () => {
      const query = builder
        .where(field('startDate', lt(fieldRef('author.createDate'))))
        .include('author')
        .build();

      expect(query.where).toEqual({
        startDate: { lt: { field: 'author.createDate' } },
      });
      expect(query.include).toEqual(['author']);
    });
  });

  describe('reset', () => {
    it('should reset the builder', () => {
      builder.fields('id', 'name').limit(10);

      const query1 = builder.build();
      expect(query1.fields).toEqual(['id', 'name']);
      expect(query1.limit).toBe(10);

      builder.reset();
      const query2 = builder.build();

      expect(query2.fields).toBeUndefined();
      expect(query2.limit).toBeUndefined();
    });
  });
});
