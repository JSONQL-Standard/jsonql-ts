import { Test, TestingModule } from '@nestjs/testing';
import { Controller, Get, Module, NestModule, Req, Injectable, Inject } from '@nestjs/common';
import { JsonqlModule, JsonqlService } from '../../../src/adapters/nestjs';
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
  constructor(private jsonqlService: JsonqlService) {}

  @Get()
  async findAll(@Req() req: any) {
    return this.jsonqlService.handleRequest(req);
  }
}

@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
class DbModule {}

// Module
@Module({
  imports: [
    JsonqlModule.forRootAsync({
      imports: [DbModule],
      inject: [DatabaseService],
      useFactory: (dbService: DatabaseService) => ({
        execute: (sql: string, params: any[]) => dbService.query(sql, params),
        dialect: 'sqlite',
        tables: ['posts'], // Whitelist 'posts' table
      }),
    }),
  ],
  controllers: [PostsController],
})
class AppModule {}

describe('NestJS Adapter E2E (SQLite)', () => {
  let app: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Ensure DB is initialized
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
