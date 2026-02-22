import { Test, TestingModule } from '@nestjs/testing';
import { Controller, Get, Module, Req, Injectable } from '@nestjs/common';
import { JsonqlModule, JsonqlService } from '../../../src/adapters/nestjs';
import { setupSQLiteDB } from '../../fixtures/setup-db';
import { Database } from 'sqlite';
import request from 'supertest';
import 'reflect-metadata';

// Database Service (Mocked for sync test to avoid async init complexity in forRoot)
// In a real sync scenario, the driver/execute function would likely be available synchronously or handle promises.
// Here we just want to test that options are passed correctly.

const mockExecute = jest.fn().mockResolvedValue([{ id: 1, title: 'Sync Post' }]);

// Controller
@Controller('posts')
class PostsController {
  constructor(private jsonqlService: JsonqlService) {}

  @Get()
  async findAll(@Req() req: any) {
    return this.jsonqlService.handleRequest(req);
  }
}

// Module
@Module({
  imports: [
    JsonqlModule.forRoot({
      execute: mockExecute,
      dialect: 'sqlite',
      tables: ['posts'],
    }),
  ],
  controllers: [PostsController],
})
class AppModule {}

describe('NestJS Adapter Sync Configuration', () => {
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

  it('should work with synchronous configuration', async () => {
    const q = JSON.stringify({
      fields: ['title'],
    });

    const res = await request(app.getHttpServer()).get(`/posts?q=${encodeURIComponent(q)}`);

    expect(res.status).toBe(200);
    expect(res.body.data[0].title).toBe('Sync Post');
    expect(mockExecute).toHaveBeenCalled();
  });
});
