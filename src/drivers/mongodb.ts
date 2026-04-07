import { MongoResult } from '../transpiler/mongo';

export interface MongoDBConnection {
  db(name?: string): any;
  close(): Promise<void>;
}

/**
 * MongoDB Driver for JSONQL TypeScript SDK.
 * Executes MongoResult operations against a MongoDB database.
 */
export class MongoDBDriver {
  private db: any;

  constructor(
    private client: MongoDBConnection,
    private dbName: string,
  ) {
    this.db = client.db(dbName);
  }

  async execute(result: MongoResult): Promise<any> {
    const coll = this.db.collection(result.collection);

    switch (result.operation) {
      case 'find':
        return this.executeFind(coll, result);
      case 'aggregate':
        return this.executeAggregate(coll, result);
      case 'insertOne':
        return this.executeInsertOne(coll, result);
      case 'insertMany':
        return this.executeInsertMany(coll, result);
      case 'updateMany':
        return this.executeUpdate(coll, result);
      case 'deleteMany':
        return this.executeDelete(coll, result);
      default:
        throw new Error(`Unsupported operation: ${result.operation}`);
    }
  }

  private async executeFind(coll: any, result: MongoResult): Promise<any[]> {
    let cursor = coll.find(result.filter || {});

    if (result.projection) {
      cursor = cursor.project(result.projection);
    }
    if (result.sort) {
      cursor = cursor.sort(result.sort);
    }
    if (result.skip) {
      cursor = cursor.skip(result.skip);
    }
    if (result.limit) {
      cursor = cursor.limit(result.limit);
    }

    return cursor.toArray();
  }

  private async executeAggregate(coll: any, result: MongoResult): Promise<any[]> {
    if (!result.pipeline) return [];
    return coll.aggregate(result.pipeline).toArray();
  }

  private async executeInsertOne(coll: any, result: MongoResult): Promise<any> {
    const res = await coll.insertOne(result.document);
    return { ...result.document, _id: res.insertedId };
  }

  private async executeInsertMany(coll: any, result: MongoResult): Promise<any> {
    const docs = result.document as Record<string, any>[];
    const res = await coll.insertMany(docs);
    return { insertedCount: res.insertedCount };
  }

  private async executeUpdate(coll: any, result: MongoResult): Promise<any> {
    const res = await coll.updateMany(result.filter, result.update);
    return { modifiedCount: res.modifiedCount };
  }

  private async executeDelete(coll: any, result: MongoResult): Promise<any> {
    const res = await coll.deleteMany(result.filter);
    return { deletedCount: res.deletedCount };
  }

  async disconnect(): Promise<void> {
    await this.client.close();
  }
}
