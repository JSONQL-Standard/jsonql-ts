import { createDriver } from '../../../src/factory';
import { SQLiteDriver } from '../../../src/drivers/sqlite';
import { PostgresDriver } from '../../../src/drivers/postgres';

describe('createDriver', () => {
  describe('sqlite', () => {
    it('should create an in-memory SQLite driver by default', async () => {
      const driver = await createDriver('sqlite');
      expect(driver).toBeInstanceOf(SQLiteDriver);
      expect(driver.dialect).toBe('sqlite');

      // Verify it actually works
      await driver.query('CREATE TABLE test (id INTEGER, name TEXT)', []);
      await driver.query('INSERT INTO test VALUES (1, ?)', ['hello']);
      const rows = await driver.query('SELECT * FROM test', []);
      expect(rows).toEqual([{ id: 1, name: 'hello' }]);

      await driver.disconnect();
    });

    it('should accept a custom filename', async () => {
      const driver = await createDriver('sqlite', { filename: ':memory:' });
      expect(driver).toBeInstanceOf(SQLiteDriver);
      await driver.disconnect();
    });

    it('should read DB_FILENAME from env', async () => {
      process.env.DB_FILENAME = ':memory:';
      try {
        const driver = await createDriver('sqlite');
        expect(driver).toBeInstanceOf(SQLiteDriver);
        await driver.disconnect();
      } finally {
        delete process.env.DB_FILENAME;
      }
    });
  });

  describe('postgres', () => {
    it('should create a PostgresDriver (mocked pool)', async () => {
      // Mock pg module — we just verify the driver is created correctly
      const mockPool = {
        query: jest.fn().mockResolvedValue({ rows: [{ id: 1 }] }),
        end: jest.fn().mockResolvedValue(undefined),
      };

      // Spy on require to intercept pg
      jest.doMock('pg', () => ({
        Pool: jest.fn(() => mockPool),
        types: { setTypeParser: jest.fn() },
      }));

      // Clear module cache so factory picks up the mock
      jest.resetModules();
      const { createDriver: create } = require('../../../src/factory');

      const driver = await create('postgres', {
        connectionString: 'postgresql://test:test@localhost/test',
      });
      expect(driver.dialect).toBe('postgres');

      const rows = await driver.query('SELECT 1', []);
      expect(rows).toEqual([{ id: 1 }]);

      jest.restoreAllMocks();
    });
  });

  describe('unsupported dialect', () => {
    it('should throw for unknown dialect', async () => {
      await expect(createDriver('mongodb' as any)).rejects.toThrow(
        'Unsupported dialect: mongodb',
      );
    });
  });

  describe('return type', () => {
    it('should return a driver with the correct dialect', async () => {
      const driver = await createDriver('sqlite');
      expect(driver.dialect).toBe('sqlite');
      expect(typeof driver.query).toBe('function');
      expect(typeof driver.connect).toBe('function');
      expect(typeof driver.disconnect).toBe('function');
      await driver.disconnect();
    });
  });
});
