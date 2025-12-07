import { Test, TestingModule } from '@nestjs/testing';
import { Controller, Get, MiddlewareConsumer, Module, NestModule, Req } from '@nestjs/common';
import { JsonqlMiddleware } from '../src/adapters/nestjs';
import request from 'supertest';
import 'reflect-metadata';

// Mock Controller
@Controller('users')
class UsersController {
  @Get()
  findAll(@Req() req: any) {
    return { received: req.jsonql };
  }
}

// Mock Module
@Module({
  controllers: [UsersController],
})
class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(JsonqlMiddleware)
      .forRoutes('users');
  }
}

describe('NestJS Adapter', () => {
  let app: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should parse valid JSONQL query', async () => {
    const q = JSON.stringify({ version: '1.0', fields: ['username'] });
    const res = await request(app.getHttpServer())
      .get(`/users?q=${encodeURIComponent(q)}`);

    expect(res.status).toBe(200);
    expect(res.body.received).toEqual({
      version: '1.0',
      fields: ['username']
    });
  });

  it('should reject invalid JSONQL', async () => {
    const q = JSON.stringify({ version: '99.0' });
    const res = await request(app.getHttpServer())
      .get(`/users?q=${encodeURIComponent(q)}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid JSONQL Query');
  });
});
