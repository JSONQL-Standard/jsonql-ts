/**
 * MongoDB Transpiler for JSONQL TypeScript SDK.
 *
 * Converts JSONQL queries into MongoDB operation descriptors
 * that can be executed by the MongoDB Node.js driver.
 */

import { JSONQLQuery, JSONQLWhere, JSONQLMutation, JSONQLStatement, isMutation } from '../types';

export interface MongoResult {
  collection: string;
  operation: 'find' | 'insertOne' | 'insertMany' | 'updateMany' | 'deleteMany' | 'aggregate';
  filter: Record<string, any>;
  projection?: Record<string, any>;
  sort?: Record<string, any>;
  limit?: number;
  skip?: number;
  pipeline?: Record<string, any>[];
  document?: Record<string, any> | Record<string, any>[];
  update?: Record<string, any>;
}

export class MongoTranspiler {
  transpile(statement: JSONQLStatement, collectionName: string): MongoResult {
    if (isMutation(statement)) {
      return this.transpileMutation(statement as JSONQLMutation, collectionName);
    }
    return this.transpileQuery(statement as JSONQLQuery, collectionName);
  }

  private transpileQuery(query: JSONQLQuery, collection: string): MongoResult {
    const result: MongoResult = {
      collection,
      operation: 'find',
      filter: {},
    };

    // WHERE → filter
    if (query.where) {
      result.filter = this.processWhere(query.where);
    }

    // FIELDS → projection
    if (query.fields && query.fields.length > 0) {
      result.projection = {};
      for (const f of query.fields) {
        result.projection[f] = 1;
      }
    }

    // SORT
    if (query.sort) {
      const sortItems = typeof query.sort === 'string' ? [query.sort] : query.sort;
      result.sort = {};
      for (const s of sortItems) {
        if (s.startsWith('-')) {
          result.sort[s.substring(1)] = -1;
        } else {
          result.sort[s] = 1;
        }
      }
    }

    // LIMIT
    if (query.limit !== undefined) {
      result.limit = query.limit;
    }

    // SKIP
    if (query.skip !== undefined) {
      result.skip = query.skip;
    }

    // DISTINCT → aggregation pipeline with $group + $project
    if (query.distinct && !query.aggregate) {
      const distinctFields: string[] = Array.isArray(query.distinct)
        ? query.distinct
        : query.fields && query.fields.length > 0
          ? query.fields
          : [];

      if (distinctFields.length > 0) {
        result.operation = 'aggregate';
        const pipeline: Record<string, any>[] = [];

        if (Object.keys(result.filter).length > 0) {
          pipeline.push({ $match: result.filter });
        }

        const groupId: Record<string, any> = {};
        const groupStage: Record<string, any> = { _id: groupId };
        for (const f of distinctFields) {
          groupId[f] = `$${f}`;
          groupStage[f] = { $first: `$${f}` };
        }
        pipeline.push({ $group: groupStage });

        const projectStage: Record<string, any> = { _id: 0 };
        for (const f of distinctFields) {
          projectStage[f] = 1;
        }
        pipeline.push({ $project: projectStage });

        if (result.sort) {
          pipeline.push({ $sort: result.sort });
        }
        if (result.skip) {
          pipeline.push({ $skip: result.skip });
        }
        if (result.limit) {
          pipeline.push({ $limit: result.limit });
        }

        result.pipeline = pipeline;
        return result;
      }
    }

    // AGGREGATE → aggregation pipeline
    if (query.aggregate) {
      result.operation = 'aggregate';
      const pipeline: Record<string, any>[] = [];

      // $match stage
      if (Object.keys(result.filter).length > 0) {
        pipeline.push({ $match: result.filter });
      }

      // $group stage
      const groupStage: Record<string, any> = {};
      if (query.groupBy && query.groupBy.length > 0) {
        const groupId: Record<string, any> = {};
        for (const g of query.groupBy) {
          groupId[g] = `$${g}`;
        }
        groupStage._id = groupId;
        for (const g of query.groupBy) {
          groupStage[g] = { $first: `$${g}` };
        }
      } else {
        groupStage._id = null;
      }

      for (const [alias, aggDef] of Object.entries(query.aggregate)) {
        const func = Object.keys(aggDef)[0];
        const field = (aggDef as any)[func] as string;

        switch (func) {
          case 'count':
            groupStage[alias] =
              field === '*'
                ? { $sum: 1 }
                : {
                    $sum: { $cond: [{ $ne: [`$${field}`, null] }, 1, 0] },
                  };
            break;
          case 'sum':
            groupStage[alias] = { $sum: `$${field}` };
            break;
          case 'avg':
            groupStage[alias] = { $avg: `$${field}` };
            break;
          case 'min':
            groupStage[alias] = { $min: `$${field}` };
            break;
          case 'max':
            groupStage[alias] = { $max: `$${field}` };
            break;
          default:
            throw new Error(`Unknown aggregate function: ${func}`);
        }
      }

      pipeline.push({ $group: groupStage });

      if (result.sort) {
        pipeline.push({ $sort: result.sort });
      }
      if (result.skip) {
        pipeline.push({ $skip: result.skip });
      }
      if (result.limit) {
        pipeline.push({ $limit: result.limit });
      }

      result.pipeline = pipeline;
    }

    return result;
  }

  private transpileMutation(mutation: JSONQLMutation, collection: string): MongoResult {
    if (mutation.op === 'create') {
      const rows = Array.isArray(mutation.data) ? mutation.data : [mutation.data];
      return {
        collection,
        operation: rows.length > 1 ? 'insertMany' : 'insertOne',
        filter: {},
        document: rows.length > 1 ? rows : rows[0],
      };
    }

    if (mutation.op === 'update') {
      const filter = mutation.where ? this.processWhere(mutation.where) : {};
      return {
        collection,
        operation: 'updateMany',
        filter,
        update: { $set: mutation.patch },
      };
    }

    if (mutation.op === 'delete') {
      const filter = mutation.where ? this.processWhere(mutation.where) : {};
      return {
        collection,
        operation: 'deleteMany',
        filter,
      };
    }

    throw new Error(`Unsupported mutation op: ${(mutation as any).op}`);
  }

  private processWhere(where: JSONQLWhere): Record<string, any> {
    const filter: Record<string, any> = {};

    for (const [key, value] of Object.entries(where)) {
      if (key === 'or' || key === 'OR') {
        if (Array.isArray(value)) {
          const orConditions = value.map((sub: any) => this.processWhere(sub));
          filter.$or = orConditions;
        }
        continue;
      }

      if (key === 'and' || key === 'AND') {
        if (Array.isArray(value)) {
          const andConditions = value.map((sub: any) => this.processWhere(sub));
          filter.$and = andConditions;
        }
        continue;
      }

      if (key === 'not' || key === 'NOT') {
        const subFilter = this.processWhere(value as JSONQLWhere);
        for (const [subKey, subVal] of Object.entries(subFilter)) {
          filter[subKey] = { $not: subVal };
        }
        continue;
      }

      const condition = value;
      if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
        const mongoOp: Record<string, any> = {};
        if ('eq' in condition) {
          filter[key] = condition.eq;
          continue;
        }
        if ('ne' in condition || 'neq' in condition) {
          mongoOp.$ne = condition.ne !== undefined ? condition.ne : (condition as any).neq;
        }
        if ('gt' in condition) mongoOp.$gt = condition.gt;
        if ('gte' in condition) mongoOp.$gte = condition.gte;
        if ('lt' in condition) mongoOp.$lt = condition.lt;
        if ('lte' in condition) mongoOp.$lte = condition.lte;
        if ('like' in condition) {
          const pattern = String(condition.like).replace(/%/g, '.*').replace(/_/g, '.');
          mongoOp.$regex = pattern;
          mongoOp.$options = 'i';
        }
        if ('in' in condition && Array.isArray(condition.in)) {
          mongoOp.$in = condition.in;
        }
        if (Object.keys(mongoOp).length > 0) {
          filter[key] = mongoOp;
        }
      } else {
        filter[key] = condition;
      }
    }

    return filter;
  }
}
