export const buildRequestSchema = {
  type: 'object',
  required: ['prototype_id', 'files'],
  properties: {
    prototype_id: {
      type: 'string',
      minLength: 1,
      pattern: '^[a-zA-Z0-9_-]+$'
    },
    files: {
      type: 'object',
      patternProperties: {
        '.*': {
          type: 'object',
          required: ['path', 'content'],
          properties: {
            path: {
              type: 'string',
              minLength: 1
            },
            content: {
              type: 'string'
            }
          },
          additionalProperties: false
        }
      },
      minProperties: 1
    },
    buildId: {
      type: 'string',
      format: 'uuid'
    }
  },
  additionalProperties: false
};

export const workerAddSchema = {
  type: 'object',
  required: ['endpoint'],
  properties: {
    endpoint: {
      type: 'string',
      format: 'uri',
      pattern: '^https?://'
    },
    maxConcurrentBuilds: {
      type: 'integer',
      minimum: 1,
      maximum: 10,
      default: 3
    }
  },
  additionalProperties: false
};