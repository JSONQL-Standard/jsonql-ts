import * as fs from 'fs';
import * as path from 'path';
import { JSONQL } from '../../src/core';

// Allow overriding spec path via environment variable for CI/CD
const SUITES_DIR = process.env.JSONQL_SPEC_PATH
  ? path.resolve(process.env.JSONQL_SPEC_PATH, 'tests/suites')
  : path.resolve(__dirname, '../fixtures/suites');

describe('JSONQL Compliance Tests', () => {
  if (!fs.existsSync(SUITES_DIR)) {
    console.warn(`Spec directory not found at ${SUITES_DIR}, skipping compliance tests.`);
    return;
  }

  // 1. Standard Suite
  const standardTestsDir = path.join(SUITES_DIR, 'standard/tests');
  if (fs.existsSync(standardTestsDir)) {
    const files = fs.readdirSync(standardTestsDir).filter((f) => f.endsWith('.json'));
    files.forEach((file) => {
      const content = fs.readFileSync(path.join(standardTestsDir, file), 'utf-8');
      const testCases = JSON.parse(content);

      describe(`Standard: ${file}`, () => {
        testCases.forEach((testCase: any) => {
          it(`${testCase.id}: ${testCase.description}`, () => {
            const jsonql = new JSONQL(testCase.schema); // Pass schema if available

            if (testCase.valid !== false) {
              expect(() => {
                jsonql.parse(testCase.query);
              }).not.toThrow();
            } else {
              expect(() => {
                jsonql.parse(testCase.query);
              }).toThrow();
            }
          });
        });
      });
    });
  }

  // 2. Issues Suite
  const issuesDir = path.join(SUITES_DIR, 'issues');
  if (fs.existsSync(issuesDir)) {
    const issueFolders = fs.readdirSync(issuesDir);
    issueFolders.forEach((folder) => {
      const testFile = path.join(issuesDir, folder, 'test.json');
      if (fs.existsSync(testFile)) {
        const content = fs.readFileSync(testFile, 'utf-8');
        const testCases = JSON.parse(content);

        // Load schema if exists
        let schema = undefined;
        const schemaFile = path.join(issuesDir, folder, 'schema.json');
        if (fs.existsSync(schemaFile)) {
          schema = JSON.parse(fs.readFileSync(schemaFile, 'utf-8'));
        }

        describe(`Issue: ${folder}`, () => {
          testCases.forEach((testCase: any) => {
            it(`${testCase.id}: ${testCase.description}`, () => {
              const jsonql = new JSONQL(schema || testCase.schema);

              if (testCase.valid !== false) {
                // Default to valid if not specified
                expect(() => {
                  jsonql.parse(testCase.query);
                }).not.toThrow();
              } else {
                expect(() => {
                  jsonql.parse(testCase.query);
                }).toThrow();
              }
            });
          });
        });
      }
    });
  }

  // 3. Security Suite
  const securityDir = path.join(SUITES_DIR, 'security');
  if (fs.existsSync(securityDir)) {
    const files = fs.readdirSync(securityDir).filter((f) => f.endsWith('.json'));
    files.forEach((file) => {
      const content = fs.readFileSync(path.join(securityDir, file), 'utf-8');
      const testCases = JSON.parse(content);

      describe(`Security: ${file}`, () => {
        testCases.forEach((testCase: any) => {
          it(`${testCase.id}: ${testCase.description}`, () => {
            const jsonql = new JSONQL(testCase.schema);

            if (testCase.valid) {
              expect(() => {
                jsonql.parse(testCase.query);
              }).not.toThrow();
            } else {
              expect(() => {
                jsonql.parse(testCase.query);
              }).toThrow();
            }
          });
        });
      });
    });
  }

  // 4. Permissions Suite
  const permissionsDir = path.join(SUITES_DIR, 'permissions');
  if (fs.existsSync(permissionsDir)) {
    const schemaPath = path.join(permissionsDir, 'schema.json');
    let sharedSchema: any = undefined;
    if (fs.existsSync(schemaPath)) {
      sharedSchema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
    }

    const testsDir = path.join(permissionsDir, 'tests');
    if (fs.existsSync(testsDir)) {
      const files = fs.readdirSync(testsDir).filter((f) => f.endsWith('.json'));
      files.forEach((file) => {
        const content = fs.readFileSync(path.join(testsDir, file), 'utf-8');
        const testCases = JSON.parse(content);

        describe(`Permissions: ${file}`, () => {
          testCases.forEach((testCase: any) => {
            it(`${testCase.id}: ${testCase.description}`, () => {
              // Use test-specific schema or shared schema
              const schema = testCase.schema || sharedSchema;
              const jsonql = new JSONQL(schema, testCase.tableName);

              if (testCase.valid) {
                expect(() => {
                  const result = jsonql.parseAndValidate(testCase.query);
                  if (!result.validation.valid) {
                    throw new Error(JSON.stringify(result.validation.errors));
                  }
                }).not.toThrow();
              } else {
                try {
                  const result = jsonql.parseAndValidate(testCase.query);
                  if (result.validation.valid) {
                    throw new Error('Expected validation to fail but it passed');
                  }
                  // Optional: Check error code if provided
                  if (testCase.errorCode) {
                    const hasCode = result.validation.errors.some(
                      (e: any) => e.code === testCase.errorCode,
                    );
                    if (!hasCode) {
                      throw new Error(
                        `Expected error code ${testCase.errorCode} but got ${JSON.stringify(result.validation.errors)}`,
                      );
                    }
                  }
                } catch (e: any) {
                  // If it threw (e.g. parse error), that's also a failure if we expected valid=false
                  // But here we are testing validation logic mostly.
                  // If valid=false, we expect either a throw or a validation error.
                  // My implementation of parseAndValidate doesn't throw on validation error, it returns result.
                  // So the try block above handles the "it passed" case.
                  // If it threw an actual Error (like "Expected validation to fail..."), rethrow it.
                  if (
                    e.message === 'Expected validation to fail but it passed' ||
                    e.message.startsWith('Expected error code')
                  ) {
                    throw e;
                  }
                }
              }
            });
          });
        });
      });
    }
  }
});
