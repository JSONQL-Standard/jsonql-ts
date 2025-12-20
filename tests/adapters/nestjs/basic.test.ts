import { Test, TestingModule } from '@nestjs/testing';
import {
  Controller,
  Get,
  MiddlewareConsumer,
  Module,
  NestModule,
  Req,
  Injectable,
} from '@nestjs/common';
import { JsonqlMiddleware } from '../../../src/adapters/nestjs';
import { ResultHydrator } from '../../../src/hydrator';
import { SQLTranspiler } from '../../../src/transpiler';
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

// Controller
@Controller('posts')
class PostsController {
  private hydrator = new ResultHydrator();
  private transpiler = new SQLTranspiler('sqlite');

  constructor(private db: DatabaseService) {}

  @Get()
  async findAll(@Req() req: any) {
    const query = req.jsonql;
    const { sql, parameters } = this.transpiler.transpile(query, 'posts');

    const flatRows = await this.db.query(sql, parameters);
    const hydrated = this.hydrator.hydrate(flatRows);

    return { meta: { query }, data: hydrated };
  }
}

// Module
@Module({
  controllers: [PostsController],
  providers: [DatabaseService],
})
class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(JsonqlMiddleware).forRoutes('posts');
  }
}

describe('NestJS Adapter E2E (SQLite)', () => {
  let app: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Trigger onModuleInit manually if needed, but Nest usually handles it.
    // However, setupSQLiteDB is async, so we might need to wait or ensure it's done.
    // The DatabaseService.onModuleInit hook is standard NestJS.
    const dbService = app.get(DatabaseService);
    await dbService.onModuleInit();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should fetch posts with simple fields', async () => {
    const q = JSON.stringify({
      fields: ['title', 'views'],
      where: { published: true },
    });

    const res = await request(app.getHttpServer()).get(`/posts?q=${encodeURIComponent(q)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0].title).toBe('Introduction to JSONQL');
  });
});
