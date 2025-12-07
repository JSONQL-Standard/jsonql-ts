"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const builder_1 = require("../../src/builder");
describe('JSONQLQueryBuilder', () => {
    let builder;
    beforeEach(() => {
        builder = new builder_1.JSONQLQueryBuilder();
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
            const query = builder.where((0, builder_1.field)('age', (0, builder_1.gt)(18))).build();
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
                .where((0, builder_1.field)('age', (0, builder_1.gte)(18)))
                .andWhere((0, builder_1.field)('status', (0, builder_1.eq)('active')))
                .build();
            expect(query.where.and).toHaveLength(2);
        });
        it('should build query with orWhere', () => {
            const query = builder
                .where((0, builder_1.field)('role', (0, builder_1.eq)('admin')))
                .orWhere((0, builder_1.field)('role', (0, builder_1.eq)('moderator')))
                .build();
            expect(query.where.or).toHaveLength(2);
        });
    });
    describe('helper functions', () => {
        it('should create eq condition', () => {
            const condition = (0, builder_1.eq)('active');
            expect(condition).toEqual({ eq: 'active' });
        });
        it('should create ne condition', () => {
            const condition = (0, builder_1.ne)('deleted');
            expect(condition).toEqual({ ne: 'deleted' });
        });
        it('should create gt condition', () => {
            const condition = (0, builder_1.gt)(18);
            expect(condition).toEqual({ gt: 18 });
        });
        it('should create gte condition', () => {
            const condition = (0, builder_1.gte)(18);
            expect(condition).toEqual({ gte: 18 });
        });
        it('should create lt condition', () => {
            const condition = (0, builder_1.lt)(100);
            expect(condition).toEqual({ lt: 100 });
        });
        it('should create lte condition', () => {
            const condition = (0, builder_1.lte)(100);
            expect(condition).toEqual({ lte: 100 });
        });
        it('should create in condition', () => {
            const condition = (0, builder_1.inArray)([1, 2, 3]);
            expect(condition).toEqual({ in: [1, 2, 3] });
        });
        it('should create nin condition', () => {
            const condition = (0, builder_1.nin)(['spam', 'deleted']);
            expect(condition).toEqual({ nin: ['spam', 'deleted'] });
        });
        it('should create contains condition', () => {
            const condition = (0, builder_1.contains)('john');
            expect(condition).toEqual({ contains: 'john' });
        });
        it('should create starts condition', () => {
            const condition = (0, builder_1.starts)('admin');
            expect(condition).toEqual({ starts: 'admin' });
        });
        it('should create ends condition', () => {
            const condition = (0, builder_1.ends)('@example.com');
            expect(condition).toEqual({ ends: '@example.com' });
        });
        it('should create field reference', () => {
            const ref = (0, builder_1.fieldRef)('author.created_at');
            expect(ref).toEqual({ field: 'author.created_at' });
        });
        it('should create AND condition', () => {
            const condition = (0, builder_1.and)((0, builder_1.field)('age', (0, builder_1.gte)(18)), (0, builder_1.field)('status', (0, builder_1.eq)('active')));
            expect(condition).toEqual({
                and: [{ age: { gte: 18 } }, { status: { eq: 'active' } }],
            });
        });
        it('should create OR condition', () => {
            const condition = (0, builder_1.or)((0, builder_1.field)('role', (0, builder_1.eq)('admin')), (0, builder_1.field)('role', (0, builder_1.eq)('moderator')));
            expect(condition).toEqual({
                or: [{ role: { eq: 'admin' } }, { role: { eq: 'moderator' } }],
            });
        });
        it('should create NOT condition', () => {
            const condition = (0, builder_1.not)((0, builder_1.field)('status', (0, builder_1.eq)('deleted')));
            expect(condition).toEqual({
                not: { status: { eq: 'deleted' } },
            });
        });
    });
    describe('complex queries', () => {
        it('should build a complex query', () => {
            const query = builder
                .fields('id', 'name', 'email')
                .where((0, builder_1.and)((0, builder_1.field)('age', (0, builder_1.gte)(18)), (0, builder_1.or)((0, builder_1.field)('role', (0, builder_1.eq)('admin')), (0, builder_1.field)('email', (0, builder_1.ends)('@company.com')))))
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
            const query = builder.where((0, builder_1.field)('price', (0, builder_1.gt)((0, builder_1.fieldRef)('cost')))).build();
            expect(query.where).toEqual({
                price: { gt: { field: 'cost' } },
            });
        });
        it('should build query with nested field comparison', () => {
            const query = builder
                .where((0, builder_1.field)('startDate', (0, builder_1.lt)((0, builder_1.fieldRef)('author.createDate'))))
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
