import { PostgresDriver, PostgresDriverOptions } from '../../../src/drivers/postgres';

// We can't easily test actual PG type parsers without a real PG connection,
// but we can test construction and option handling.

describe('PostgresDriver', () => {
  // Create a mock pool that satisfies the PostgresConnection type
  const mockPool = {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    end: jest.fn().mockResolvedValue(undefined),
  } as any;

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should construct with just a client (backward compat)', () => {
    const driver = new PostgresDriver(mockPool);
    expect(driver.dialect).toBe('postgres');
  });

  it('should construct with options', () => {
    const driver = new PostgresDriver(mockPool, { fixNumericTypes: true });
    expect(driver.dialect).toBe('postgres');
  });

  it('should construct with fixNumericTypes disabled', () => {
    const driver = new PostgresDriver(mockPool, { fixNumericTypes: false });
    expect(driver.dialect).toBe('postgres');
  });

  it('should delegate query to client', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'test' }] });
    const driver = new PostgresDriver(mockPool, { fixNumericTypes: false });
    const result = await driver.query('SELECT * FROM users', []);
    expect(result).toEqual([{ id: 1, name: 'test' }]);
    expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM users', []);
  });

  it('should delegate disconnect to client.end', async () => {
    const driver = new PostgresDriver(mockPool, { fixNumericTypes: false });
    await driver.disconnect();
    expect(mockPool.end).toHaveBeenCalled();
  });
});
