"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const common_1 = require("@nestjs/common");
const nestjs_1 = require("../src/adapters/nestjs");
const supertest_1 = __importDefault(require("supertest"));
require("reflect-metadata");
// Mock Controller
let UsersController = class UsersController {
    findAll(req) {
        return { received: req.jsonql };
    }
};
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "findAll", null);
UsersController = __decorate([
    (0, common_1.Controller)('users')
], UsersController);
// Mock Module
let AppModule = class AppModule {
    configure(consumer) {
        consumer
            .apply(nestjs_1.JsonqlMiddleware)
            .forRoutes('users');
    }
};
AppModule = __decorate([
    (0, common_1.Module)({
        controllers: [UsersController],
    })
], AppModule);
describe('NestJS Adapter', () => {
    let app;
    beforeAll(async () => {
        const moduleFixture = await testing_1.Test.createTestingModule({
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
        const res = await (0, supertest_1.default)(app.getHttpServer())
            .get(`/users?q=${encodeURIComponent(q)}`);
        expect(res.status).toBe(200);
        expect(res.body.received).toEqual({
            version: '1.0',
            fields: ['username']
        });
    });
    it('should reject invalid JSONQL', async () => {
        const q = JSON.stringify({ version: '99.0' });
        const res = await (0, supertest_1.default)(app.getHttpServer())
            .get(`/users?q=${encodeURIComponent(q)}`);
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Invalid JSONQL Query');
    });
});
