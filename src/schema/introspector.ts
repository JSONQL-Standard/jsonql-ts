import { JSONQLSchema } from '../types';

export interface JSONQLIntrospector {
  introspect(): Promise<JSONQLSchema>;
}
