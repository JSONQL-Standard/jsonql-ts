export const inferMutationFromRequest = (method: string, input: any) => {
  if (!input || typeof input !== 'object' || Array.isArray(input) || 'op' in input) {
    return input;
  }

  if (method === 'PATCH' && 'patch' in input) {
    return { ...input, op: 'update' };
  }

  if (method === 'DELETE' && 'where' in input) {
    return { ...input, op: 'delete' };
  }

  if (method === 'POST' && 'data' in input) {
    return { ...input, op: 'create' };
  }

  return input;
};
