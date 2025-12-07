"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const sqlite3_1 = __importDefault(require("sqlite3"));
const sqlite_1 = require("sqlite");
const pg_1 = require("pg");
const transpiler_1 = require("../../src/transpiler");
const parser_1 = require("../../src/parser");
// Allow overriding spec path via environment variable for CI/CD
const SUITES_DIR = process.env.JSONQL_SPEC_PATH
    ? path.resolve(process.env.JSONQL_SPEC_PATH, 'tests/suites')
    : path.resolve(__dirname, '../../../jsonql-spec/tests/suites');
describe('JSONQL Execution Tests', () => {
    let db;
    let isPostgres = false;
    beforeAll(async () => {
        if (process.env.TEST_DB_URL) {
            // Postgres
            isPostgres = true;
            const client = new pg_1.Client({
                connectionString: process.env.TEST_DB_URL
            });
            await client.connect();
            db = client;
            console.log('Connected to Postgres');
            // Skip data loading as it is assumed to be pre-loaded by docker-compose init scripts
        }
        else {
            // SQLite (In-Memory)
            // 1. Load Data
            const dataPath = path.join(SUITES_DIR, 'standard/data.json');
            if (!fs.existsSync(dataPath)) {
                console.warn(`Data file not found at ${dataPath}, skipping execution tests.`);
                return;
            }
            const dataset = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
            // 2. Setup DB
            const sqliteDb = await (0, sqlite_1.open)({
                filename: ':memory:',
                driver: sqlite3_1.default.Database
            });
            db = sqliteDb;
            // 3. Create Tables and Insert Data
            for (const [tableName, rows] of Object.entries(dataset)) {
                if (!Array.isArray(rows) || rows.length === 0)
                    continue;
                // Infer schema
                const firstRow = rows[0];
                const colDefs = [];
                const colNames = [];
                for (const [col, val] of Object.entries(firstRow)) {
                    let colType = 'TEXT';
                    if (typeof val === 'number') {
                        colType = Number.isInteger(val) ? 'INTEGER' : 'REAL';
                    }
                    else if (typeof val === 'boolean') {
                        colType = 'BOOLEAN';
                    }
                    else if (typeof val === 'object' && val !== null) {
                        // JSON support for sqlite (stored as text)
                        colType = 'TEXT';
                    }
                    colDefs.push(`${col} ${colType}`);
                    colNames.push(col);
                }
                await sqliteDb.exec(`CREATE TABLE ${tableName} (${colDefs.join(', ')})`);
                const placeholders = colNames.map(() => '?').join(', ');
                const stmt = await sqliteDb.prepare(`INSERT INTO ${tableName} (${colNames.join(', ')}) VALUES (${placeholders})`);
                for (const row of rows) {
                    const values = colNames.map(c => {
                        const val = row[c];
                        if (typeof val === 'object' && val !== null) {
                            return JSON.stringify(val);
                        }
                        return val;
                    });
                    await stmt.run(values);
                }
                await stmt.finalize();
            }
        }
    });
    afterAll(async () => {
        if (db) {
            if (isPostgres) {
                await db.end();
            }
            else {
                await db.close();
            }
        }
    });
    const testFiles = [
        { path: 'standard/tests/execution.json', name: 'execution.json' },
        { path: 'standard/tests/advanced.json', name: 'advanced.json' },
        { path: 'standard/tests/user_scenarios.json', name: 'user_scenarios.json' },
        { path: 'security/sql_injection.json', name: 'sql_injection.json' }
    ];
    for (const file of testFiles) {
        const execTestPath = path.join(SUITES_DIR, file.path);
        if (fs.existsSync(execTestPath)) {
            const testCases = JSON.parse(fs.readFileSync(execTestPath, 'utf-8'));
            describe(`Suite: ${file.name}`, () => {
                const parser = new parser_1.JSONQLParser();
                testCases.forEach((tc) => {
                    // Only run tests with expectedResult
                    if (!tc.expectedResult)
                        return;
                    it(`${tc.id}: ${tc.description}`, async () => {
                        if (!db)
                            return;
                        const transpiler = new transpiler_1.SQLTranspiler(isPostgres ? 'postgres' : 'sqlite');
                        // Parse (validate)
                        const query = parser.parse(tc.query);
                        // Determine table name
                        const tableName = tc.tableName || tc.query.from;
                        if (!tableName) {
                            throw new Error(`Test ${tc.id} missing tableName or query.from`);
                        }
                        // Transpile
                        const { sql, parameters } = transpiler.transpile(query, tableName);
                        // Execute
                        let rows;
                        if (isPostgres) {
                            const res = await db.query(sql, parameters);
                            rows = res.rows;
                        }
                        else {
                            rows = await db.all(sql, parameters);
                        }
                        // Compare
                        expect(rows.length).toBe(tc.expectedResult.length);
                        for (let i = 0; i < tc.expectedResult.length; i++) {
                            const expected = tc.expectedResult[i];
                            const actual = rows[i];
                            for (const [key, value] of Object.entries(expected)) {
                                // Handle nested objects (relationships) - simplistic check for now
                                if (typeof value === 'object' && value !== null) {
                                    continue;
                                }
                                expect(actual).toHaveProperty(key);
                                // Handle boolean conversion (sqlite returns 0/1 for boolean)
                                let actualVal = actual[key];
                                if (!isPostgres && typeof value === 'boolean' && typeof actualVal === 'number') {
                                    actualVal = actualVal === 1;
                                }
                                // Handle numeric types (postgres returns strings for some numerics like decimal)
                                if (isPostgres && typeof value === 'number' && typeof actualVal === 'string') {
                                    actualVal = parseFloat(actualVal);
                                }
                                expect(actualVal).toEqual(value);
                            }
                        }
                    });
                });
            });
        }
    }
});
