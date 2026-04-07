import { Test, TestingModule } from '@nestjs/testing';
import { Controller, All, Req, Res, Module, Injectable, UseFilters } from '@nestjs/common';
import { JsonqlModule, JsonqlService, JsonqlExceptionFilter } from '../../../src/adapters/nestjs';
import { setupSQLiteDB } from '../../fixtures/setup-db';
import { Database } from 'sqlite';
import request from 'supertest';
import 'reflect-metadata';

// Database Service
@Injectable()
class DatabaseService {
  private db: Database | null = null;

  async onModuleInit() {
    this.db = await setupSQLiteDB();
  }

  async query(sql: string, params: any[]) {
    if (!this.db) throw new Error('DB not initialized');
    return this.db.all(sql, params);
  }
}

// ── Recommended approach: pass res to handleRequest ──────────────
@Controller('with-res')
class WithResController {
  constructor(private jsonql: JsonqlService) {}

  @All(':resource')
  async handle(@Req() req: any, @Res() res: any) {
    return this.jsonql.handleRequest(req, `/${req.params.resource}`, res);
  }
}

// ── Alternative approach: no res, use JsonqlExceptionFilter ──────
@UseFilters(JsonqlExceptionFilter)
@Controller('with-filter')
class WithFilterController {
  constructor(private jsonql: JsonqlService) {}

  @All(':resource')
  async handle(@Req() req: any) {
    return this.jsonql.handleRequest(req, `/${req.params.resource}`);
  }
}

@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
class DbModule {}

function createTestModule(hooks: Record<string, Function> = {}) {
  @Module({
    imports: [
      JsonqlModule.forRootAsync({
        imports: [DbModule],
        inject: [DatabaseService],
        useFactory: (dbService: DatabaseService) => ({
          execute: (sql: string, params: any[]) => dbService.query(sql, params),
          dialect: 'sqlite' as const,
          ...hooks,
        }),
      }),
    ],
    controllers: [WithResController, WithFilterController],
  })
  class TestAppModule {}

  return TestAppModule;
}

describe('NestJS error normalisation', () => {
  jest.setTimeout(20000);

  let app: any;

  beforeAll(async () => {
    const TestModule = createTestModule({
      beforeQuery: (query: any, req: any) => {
        const fail = req.headers['x-test-fail'];
        if (fail === 'plain-object') {
          throw { status: 400, error: 'Hook validation failed' };
        }
        if (fail === 'plain-403') {
          throw { status: 403, error: 'Forbidden by hook', details: 'access denied' };
        }
        if (fail === 'error-instance') {
          throw new Error('Unexpected error in hook');
        }
        return query;
      },
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [TestModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    const dbService = app.get(DatabaseService);
    await dbService.onModuleInit();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── handleRequest(req, path, res) — recommended pattern ────────
  describe('with res parameter (recommended)', () => {
    const base = '/with-res';

    it('returns 200 for valid queries', async () => {
      const q = JSON.stringify({ fields: ['title', 'views'], where: { published: true } });
      const res = await request(app.getHttpServer()).get(
        `${base}/posts?q=${encodeURIComponent(q)}`,
      );

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('normalises plain { status, error } objects from hooks', async () => {
      const q = JSON.stringify({ fields: ['title'] });
      const res = await request(app.getHttpServer())
        .get(`${base}/posts?q=${encodeURIComponent(q)}`)
        .set('X-Test-Fail', 'plain-object');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'Hook validation failed',
        details: 'Hook validation failed',
      });
    });

    it('preserves status code from plain error objects', async () => {
      const q = JSON.stringify({ fields: ['title'] });
      const res = await request(app.getHttpServer())
        .get(`${base}/posts?q=${encodeURIComponent(q)}`)
        .set('X-Test-Fail', 'plain-403');

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Forbidden by hook', details: 'access denied' });
    });

    it('normalises Error instances from hooks', async () => {
      const q = JSON.stringify({ fields: ['title'] });
      const res = await request(app.getHttpServer())
        .get(`${base}/posts?q=${encodeURIComponent(q)}`)
        .set('X-Test-Fail', 'error-instance');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Unexpected error in hook');
    });

    it('normalises errors from createError() (e.g. invalid query)', async () => {
      const q = JSON.stringify({ from: 'nonexistent' });
      const res = await request(app.getHttpServer()).get(
        `${base}/posts?q=${encodeURIComponent(q)}`,
      );

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body).toHaveProperty('details');
    });
  });

  // ── handleRequest(req, path) + @UseFilters — alternative pattern ─
  describe('with JsonqlExceptionFilter (alternative)', () => {
    const base = '/with-filter';

    it('normalises plain hook errors via the filter', async () => {
      const q = JSON.stringify({ fields: ['title'] });
      const res = await request(app.getHttpServer())
        .get(`${base}/posts?q=${encodeURIComponent(q)}`)
        .set('X-Test-Fail', 'plain-object');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'Hook validation failed',
        details: 'Hook validation failed',
      });
    });

    it('preserves 403 status from hook errors via the filter', async () => {
      const q = JSON.stringify({ fields: ['title'] });
      const res = await request(app.getHttpServer())
        .get(`${base}/posts?q=${encodeURIComponent(q)}`)
        .set('X-Test-Fail', 'plain-403');

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Forbidden by hook', details: 'access denied' });
    });
  });

  // ── JsonqlExceptionFilter unit tests ──────────────────────────
  describe('JsonqlExceptionFilter', () => {
    const filter = new JsonqlExceptionFilter();
    const mockHost = (mockRes: any) =>
      ({
        switchToHttp: () => ({ getResponse: () => mockRes }),
      }) as any;

    it('normalises plain error objects', () => {
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      filter.catch({ status: 403, error: 'Forbidden', details: 'no access' }, mockHost(res));
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden', details: 'no access' });
    });

    it('normalises Error instances with status property', () => {
      const err = Object.assign(new Error('Hook failed'), {
        status: 400,
        error: 'Hook failed',
        details: 'bad input',
      });
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      filter.catch(err, mockHost(res));
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Hook failed', details: 'bad input' });
    });

    it('defaults to 400 for unknown errors', () => {
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      filter.catch('something went wrong', mockHost(res));
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('duck-types HttpException-like objects', () => {
      const fakeHttpException = {
        getStatus: () => 422,
        getResponse: () => ({ error: 'Unprocessable', details: 'bad data' }),
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      filter.catch(fakeHttpException, mockHost(res));
      expect(res.status).toHaveBeenCalledWith(422);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unprocessable', details: 'bad data' });
    });
  });
});
