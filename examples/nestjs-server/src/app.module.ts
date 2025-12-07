import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { AppController } from './app.controller';
// @ts-ignore
import { JsonqlMiddleware } from '@jsonql-standard/jsonql-ts';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(JsonqlMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
