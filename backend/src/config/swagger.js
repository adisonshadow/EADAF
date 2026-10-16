const swaggerJSDoc = require('swagger-jsdoc');
const swaggerSchemas = require('./swaggerSchemas');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'EADAF Platform API Documentation',
      version: '1.0.0',
      description: '用户认证和授权系统 API 文档',
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: '开发服务器',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: swaggerSchemas,
      responses: {
        400: {
          description: '请求参数错误',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  code: {
                    type: 'integer',
                    example: 400,
                  },
                  message: {
                    type: 'string',
                    example: '请求参数错误',
                  },
                  data: {
                    type: 'object',
                    nullable: true,
                  },
                },
              },
            },
          },
        },
        401: {
          description: '未授权',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  code: {
                    type: 'integer',
                    example: 401,
                  },
                  message: {
                    type: 'string',
                    example: '未授权',
                  },
                  data: {
                    type: 'object',
                    nullable: true,
                  },
                },
              },
            },
          },
        },
        403: {
          description: '禁止访问',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  code: {
                    type: 'integer',
                    example: 403,
                  },
                  message: {
                    type: 'string',
                    example: '禁止访问',
                  },
                  data: {
                    type: 'object',
                    nullable: true,
                  },
                },
              },
            },
          },
        },
        404: {
          description: '资源不存在',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  code: {
                    type: 'integer',
                    example: 404,
                  },
                  message: {
                    type: 'string',
                    example: '资源不存在',
                  },
                  data: {
                    type: 'object',
                    nullable: true,
                  },
                },
              },
            },
          },
        },
        500: {
          description: '服务器内部错误',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  code: {
                    type: 'integer',
                    example: 500,
                  },
                  message: {
                    type: 'string',
                    example: '服务器内部错误',
                  },
                  data: {
                    type: 'object',
                    nullable: true,
                  },
                },
              },
            },
          },
        },
      },
    },
    // security: [
    //   {
    //     bearerAuth: [],
    //   },
    // ],
    // paths: {}
  },
  apis: ['./src/routes/*.js'], // API 路由文件的路径
};

const swaggerSpec = swaggerJSDoc(options);

// 添加全局前缀
Object.keys(swaggerSpec.paths).forEach(path => {
  if (!path.startsWith('/api/v1')) {
    const newPath = `/api/v1${path}`;
    swaggerSpec.paths[newPath] = swaggerSpec.paths[path];
    delete swaggerSpec.paths[path];
  }
});

module.exports = swaggerSpec; 