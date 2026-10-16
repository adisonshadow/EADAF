import { registerFunctionCall, unregisterFunctionCall } from '@eadaf/ai-base';
import { createMutatingHandler } from '@/ai/toolMutation';
import { history } from '@/utils/navigation';
import {
  deleteApiService,
  getApiService,
  getApiServiceOperationCatalog,
  getApiServiceTestProfile,
  getApiServiceTree,
  patchApiService,
  postApiService,
  postApiServiceCheckHandler,
  postApiServiceDisable,
  postApiServicePublish,
  postApiServiceSuggestTestParams,
  postApiServiceTest,
  putApiServiceTestMockParams,
} from '@/services/EADAF/api/apiServices';
import {
  createExceptionResponse,
  deleteExceptionResponse,
  getExceptionResponses,
  patchExceptionResponse,
} from '@/services/EADAF/api/exceptionResponses';
import { getApiData, isApiSuccess } from '@/utils/apiResponse';
import { formatApiServiceTestError, extractApiServiceValidationErrors, isApiServiceTestFailure, describeApiServiceTestFailure } from './apiServiceTestError';
import { normalizeApiServiceCode, scopeCodeFromEntityCode, suggestServiceSlugFromEntity } from './apiServiceCodeUtils';
import { buildDefaultSql, executeBatchCreateServices, DEFAULT_CRUD_OPERATIONS, type BatchCreateArgs } from './apiServiceBatchCreate';
import { resolveApiServiceConnection } from './apiServiceConnectionResolve';
import { resolveApiServiceId } from './apiServiceResolve';
import { resolveApiServiceNavigateTarget } from './apiServiceWorkflowNavigation';
import {
  assessRequestParameterInterface,
  assessFindPaginationResponseDocs,
  verifyApiServiceById,
  verifyApiServiceListed,
  verifyApiServicePublished,
} from './apiServiceVerify';
import { queryApiServicesForTool } from './apiServiceListQuery';
import {
  ensureRequestParameterInterface,
  resolveEntityForRequestInterface,
  shouldAutoSuggestRequestExample,
} from './buildRequestParameterInterface';
import { ensureResponseOverridesForOperation } from '../utils/responseOverrides';

const API_SERVICE_DOMAIN = 'bizdata';
const LIST_SURFACE = 'api-services.list';
const TEST_SURFACE = 'api-services.test';
const EXCEPTION_RESPONSES_SURFACE = 'api-services.exception-responses';

const TOOL_NAMES = [
  'apiservice_list_services',
  'apiservice_list_draft_services',
  'apiservice_filter_services',
  'apiservice_get_service',
  'apiservice_resolve_connection',
  'apiservice_create_service',
  'apiservice_create_services_batch',
  'apiservice_update_service',
  'apiservice_check_handler',
  'apiservice_publish_service',
  'apiservice_disable_service',
  'apiservice_delete_service',
  'apiservice_list_operations',
  'apiservice_get_tree',
  'apiservice_get_test_profile',
  'apiservice_suggest_test_params',
  'apiservice_set_test_params',
  'apiservice_run_test',
  'apiservice_navigate',
  'apiservice_list_exception_responses',
  'apiservice_create_exception_response',
  'apiservice_update_exception_response',
  'apiservice_delete_exception_response',
] as const;

export function registerApiServiceTools() {
  registerFunctionCall({
    name: 'apiservice_list_services',
    description:
      '列出 API 服务（默认 size=-1 拉全量）。找未发布 draft 时须传 status=draft，或直接用 apiservice_list_draft_services；status=ALL 表示不过滤',
    resultBudget: { maxChars: 24_000 },
    parameters: {
      type: 'object',
      properties: {
        codePrefix: {
          type: 'string',
          description:
            'code 前缀：如 IPS:production 或 IPS:production:BomInstance（软匹配 BomInstanceCreate）',
        },
        status: {
          type: 'string',
          enum: ['draft', 'published', 'disabled', 'ALL'],
          description: 'ALL 或省略表示不过滤',
        },
        connectionId: { type: 'string' },
        tag: { type: 'string' },
        page: { type: 'integer' },
        size: {
          type: 'integer',
          description: '默认 -1 全量；分页时 total 为匹配总数，returnedCount 为本页条数',
        },
      },
    },
    handler: async (args) => queryApiServicesForTool(args as Record<string, unknown>),
  });

  registerFunctionCall({
    name: 'apiservice_list_draft_services',
    description:
      '列出未发布(draft)的 API 服务。批量「测试并发布」任务必须先用本 Tool 获取待处理列表，禁止对已是 published 的服务重复 publish',
    resultBudget: { maxChars: 24_000 },
    parameters: {
      type: 'object',
      properties: {
        codePrefix: { type: 'string', description: '域/实体前缀，如 fmms 或 IPS:production:BomInstance' },
        tag: { type: 'string' },
        connectionId: { type: 'string' },
      },
    },
    handler: async (args) => {
      const result = await queryApiServicesForTool({
        codePrefix: args.codePrefix as string,
        status: 'draft',
        tag: args.tag as string,
        connectionId: args.connectionId as string,
        size: -1,
      });
      return {
        ...result,
        hint: [
          result.hint,
          result.items.length === 0
            ? '当前过滤条件下无 draft 服务'
            : `共 ${result.returnedCount} 个 draft 待发布；仅对这些 code 调用 publish/run_test`,
        ]
          .filter(Boolean)
          .join('；'),
      };
    },
  });

  registerFunctionCall({
    name: 'apiservice_filter_services',
    description:
      '按 status/codePrefix 过滤 API 服务（与 list_services 同源，默认 size=-1）。status=ALL 不过滤；找 draft 须传 status=draft 或改用 apiservice_list_draft_services',
    resultBudget: { maxChars: 24_000 },
    parameters: {
      type: 'object',
      properties: {
        codePrefix: {
          type: 'string',
          description:
            'code 前缀，如 equipment、IPS:production、IPS:production:BomInstance（软匹配）',
        },
        status: {
          type: 'string',
          enum: ['draft', 'published', 'disabled', 'ALL'],
          description: 'ALL 或省略表示不过滤',
        },
        tag: { type: 'string', description: '标签精确匹配' },
        connectionId: { type: 'string' },
        page: { type: 'integer' },
        size: {
          type: 'integer',
          description: '默认 -1 全量；与 list_services 相同',
        },
      },
    },
    handler: async (args) => queryApiServicesForTool(args as Record<string, unknown>),
  });

  registerFunctionCall({
    name: 'apiservice_get_service',
    description:
      '获取 API 服务详情；默认省略脚本正文。改 SQL/Handler 时传 includeScripts=true',
    resultBudget: { maxChars: 24_000 },
    parameters: {
      type: 'object',
      properties: {
        serviceId: { type: 'string' },
        code: { type: 'string', description: '服务 code（非实体 code）' },
        scopeCode: { type: 'string' },
        serviceSlug: { type: 'string' },
        includeScripts: {
          type: 'boolean',
          description: '为 true 时返回 definitionScript / handlerScript / scriptOverrides 全文',
        },
      },
    },
    handler: async (args) => {
      const serviceId = await resolveApiServiceId(args as Record<string, unknown>);
      const res = await getApiService(serviceId);
      const data = getApiData<API.ApiService>(res);
      if (!data) return data;
      if (args.includeScripts === true) return data;
      const {
        definitionScript: _d,
        handlerScript: _h,
        scriptOverrides: _o,
        securityConfig,
        ...rest
      } = data as API.ApiService & Record<string, unknown>;
      const slimSecurity =
        securityConfig && typeof securityConfig === 'object'
          ? {
              accessRestriction: (securityConfig as Record<string, unknown>).accessRestriction,
              requestOverrides: (securityConfig as Record<string, unknown>).requestOverrides,
              responseOverrides: (securityConfig as Record<string, unknown>).responseOverrides,
            }
          : securityConfig;
      return {
        ...rest,
        securityConfig: slimSecurity,
        hasDefinitionScript: Boolean(String(_d || '').trim()),
        hasHandlerScript: Boolean(String(_h || '').trim()),
        scriptsOmitted: true,
        hint: '已省略脚本正文；需要全文时传 includeScripts=true',
      };
    },
  });

  registerFunctionCall({
    name: 'apiservice_resolve_connection',
    description:
      '自动推断 API 服务应使用的数据库连接与 targetSchema：优先按主实体物化记录；实体尚未物化时回落到同域已物化实体；多个连接时选物化匹配最多的连接；禁止向用户索要 connectionId。返回含 targetSchema，写 SQL 时须使用该 schema',
    parameters: {
      type: 'object',
      properties: {
        connectionId: { type: 'string', description: '通常无需传入，仅在用户明确指定时使用' },
        scopeCode: { type: 'string', description: 'Scope 引用 code，如 equipment；主实体已选时可省略' },
        entityCodes: { type: 'array', items: { type: 'string' }, description: '实体 code 列表（推荐）' },
        entityIds: { type: 'array', items: { type: 'string' }, description: '实体 ID 列表（推荐，优先于 Scope）' },
      },
    },
    handler: async (args) => resolveApiServiceConnection({
      connectionId: args.connectionId as string | undefined,
      scopeCode: args.scopeCode as string | undefined,
      entityCodes: args.entityCodes as string[] | undefined,
      entityIds: args.entityIds as string[] | undefined,
    }),
  });

  registerFunctionCall({
    name: 'apiservice_create_service',
    description:
      '创建单个 API 服务（draft，一次一个主 operation）。须传 entityId 或 entityCodes；勿臆造 requestParameterInterface / definitionScript——省略时 Tool 按实体自动生成；自定义 SQL 前须先 bizdata_get_entity',
    requiresVerification: true,
    parameters: {
      type: 'object',
      anyOf: [
        { required: ['entityId'] },
        { required: ['entityCodes'] },
        { required: ['entityIds'] },
      ],
      properties: {
        code: { type: 'string', description: '域:服务名；可省略，优先实体前缀+serviceSlug' },
        name: { type: 'string' },
        description: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        connectionId: { type: 'string', description: '禁止向用户索要；省略时按主实体物化记录自动推断' },
        scopeCode: { type: 'string', description: '可由实体 code 前缀自动得到，通常不必传' },
        serviceSlug: {
          type: 'string',
          description: '默认=实体末段+操作后缀（如 ActualHoursStatsCreate）；可改',
        },
        entityCodes: { type: 'array', items: { type: 'string' }, description: '实体 code' },
        entityIds: { type: 'array', items: { type: 'string' } },
        entityId: { type: 'string', description: '主实体 ID（必填）' },
        definitionScript: {
          type: 'string',
          description:
            'scriptMode=sql；可省略——Tool 按实体表 + targetSchema 生成默认 SQL。自定义前须 bizdata_get_entity，禁止臆造列名',
        },
        handlerScript: { type: 'string', description: 'scriptMode=typescript' },
        scriptMode: { type: 'string', enum: ['sql', 'typescript'] },
        requestParameterInterface: {
          type: 'string',
          description:
            '一般不要手写：有实体时 Tool 自动生成。禁止臆造字段；自定义前须 bizdata_get_entity',
        },
        accessRestriction: {
          type: 'object',
          properties: {
            mode: { type: 'string', enum: ['none', 'role', 'department'] },
            roleIds: { type: 'array', items: { type: 'string' } },
            departmentIds: { type: 'array', items: { type: 'string' } },
          },
        },
        enabledOperations: {
          type: 'array',
          items: { type: 'string' },
          description: '只传一个主 operation，如 ["find"]。不要一次传 CRUD 全套',
        },
        transportProtocols: {
          type: 'array',
          items: { type: 'string', enum: ['http', 'sse', 'websocket'] },
          description: '访问协议，至少一项，默认 ["http"]',
        },
        responseOverrides: {
          type: 'object',
          description: '按 operation 覆盖响应文档，如 { create: { responsesSchema, responseExample } }',
        },
        requestOverrides: {
          type: 'object',
          description: '按 operation 保存请求参数 Example（与测试 mock 同源）；未传时创建后自动生成带示例值的默认 Example',
        },
        publish: { type: 'boolean' },
      },
    },
    handler: createMutatingHandler({
      domain: API_SERVICE_DOMAIN,
      type: 'apiservice.created',
      scope: LIST_SURFACE,
      buildResourceId: (_args, data) => (data as API.ApiService)?.id,
      handler: async (args) => {
        const primaryEntityCode = Array.isArray(args.entityCodes)
          ? String(args.entityCodes[0] || '').trim() || undefined
          : undefined;

        const enabledOperations = Array.isArray(args.enabledOperations)
          ? (args.enabledOperations as string[]).slice(0, 1)
          : ['find'];
        const primaryOperation = enabledOperations[0] || 'find';

        const entityIdForIface = args.entityId ? String(args.entityId) : undefined;
        const entityIdsFromArgs = [
          ...(entityIdForIface ? [entityIdForIface] : []),
          ...(Array.isArray(args.entityIds) ? (args.entityIds as string[]) : []),
        ];
        if (!entityIdForIface && !primaryEntityCode && !entityIdsFromArgs.length) {
          throw new Error('主实体必选：请传 entityId 或 entityCodes');
        }

        let entityCode = primaryEntityCode;
        if (!entityCode) {
          const entity = await resolveEntityForRequestInterface({
            entityId: entityIdForIface || entityIdsFromArgs[0],
            entityCodes: primaryEntityCode ? [primaryEntityCode] : undefined,
          });
          entityCode = entity?.code || undefined;
        }

        const derivedScope =
          (args.scopeCode ? String(args.scopeCode).trim() : '')
          || scopeCodeFromEntityCode(entityCode)
          || undefined;
        const derivedSlug =
          (args.serviceSlug ? String(args.serviceSlug).trim() : '')
          || suggestServiceSlugFromEntity(entityCode, primaryOperation)
          || undefined;

        const serviceCode = derivedScope && derivedSlug
          ? `${derivedScope}:${derivedSlug}`
          : normalizeApiServiceCode(args.code as string | undefined, {
              entityCode,
              scopeCode: derivedScope,
              fallbackName: args.name as string | undefined,
            });

        const resolved = await resolveApiServiceConnection({
          connectionId: args.connectionId as string | undefined,
          scopeCode: derivedScope,
          entityCodes: entityCode
            ? [entityCode]
            : Array.isArray(args.entityCodes) ? (args.entityCodes as string[]) : undefined,
          entityIds: entityIdsFromArgs.length ? entityIdsFromArgs : undefined,
        });

        const accessRestriction = args.accessRestriction as API.ApiServiceAccessRestriction | undefined;
        const scriptMode = args.scriptMode === 'typescript' ? 'typescript' : 'sql';

        const entityCodesForIface = Array.isArray(args.entityCodes)
          ? (args.entityCodes as string[])
          : entityCode
            ? [entityCode]
            : undefined;
        const { interfaceText, autoGenerated } = await ensureRequestParameterInterface({
          requestParameterInterface: args.requestParameterInterface
            ? String(args.requestParameterInterface)
            : undefined,
          operation: primaryOperation,
          entityId: entityIdForIface || entityIdsFromArgs[0],
          entityCodes: entityCodesForIface,
        });

        const { overrides: ensuredResponseOverrides, autoGenerated: responseOverridesAutoGenerated } =
          ensureResponseOverridesForOperation({
            operation: primaryOperation,
            entityCode,
            requestParameterInterface: interfaceText,
            responseOverrides: args.responseOverrides as Record<
              string,
              { responsesSchema?: Record<string, unknown>; responseExample?: unknown }
            > | undefined,
          });

        let definitionScript =
          scriptMode === 'sql' && args.definitionScript
            ? String(args.definitionScript)
            : undefined;
        if (scriptMode === 'sql' && !definitionScript?.trim()) {
          const entityForSql = await resolveEntityForRequestInterface({
            entityId: entityIdForIface || entityIdsFromArgs[0],
            entityCodes: entityCodesForIface,
          });
          const tableName =
            entityForSql?.tableName
            || entityForSql?.code?.split(':').pop()
            || entityCode?.split(':').pop();
          const targetSchema = resolved.targetSchema?.trim();
          if (tableName && targetSchema) {
            definitionScript = buildDefaultSql(
              tableName,
              targetSchema,
              primaryOperation,
              resolved.dbType || 'postgresql',
            );
          }
        }

        const createRes = await postApiService({
          scopeCode: derivedScope,
          serviceSlug: derivedSlug,
          code: derivedScope && derivedSlug ? undefined : serviceCode,
          name: args.name ? String(args.name) : undefined,
          description: args.description ? String(args.description) : undefined,
          tags: Array.isArray(args.tags) ? (args.tags as string[]) : undefined,
          connectionId: resolved.connectionId,
          entityId: entityIdForIface || entityIdsFromArgs[0],
          targetSchema: resolved.targetSchema,
          scriptMode,
          definitionScript: scriptMode === 'sql' ? definitionScript : undefined,
          handlerScript:
            scriptMode === 'typescript' && args.handlerScript ? String(args.handlerScript) : undefined,
          requestParameterInterface: interfaceText || undefined,
          accessRestriction,
          enabledOperations,
          transportProtocols: Array.isArray(args.transportProtocols)
            ? (args.transportProtocols as Array<'http' | 'sse' | 'websocket'>)
            : undefined,
          responseOverrides: ensuredResponseOverrides as API.ApiServiceCreateInput['responseOverrides'],
          requestOverrides: args.requestOverrides as API.ApiServiceCreateInput['requestOverrides'],
        });
        const created = getApiData<API.ApiService>(createRes);
        if (!created?.id) throw new Error('创建 API 服务失败');

        if (primaryOperation && shouldAutoSuggestRequestExample(args.requestOverrides)) {
          try {
            const suggestRes = await postApiServiceSuggestTestParams(created.id, {
              operation: primaryOperation,
            });
            const suggestData = getApiData<API.ApiServiceSuggestTestParamsResult>(suggestRes);
            if (suggestData?.mockParameters) {
              await putApiServiceTestMockParams(created.id, {
                operation: primaryOperation,
                mockParameters: suggestData.mockParameters,
              });
            }
          } catch {
            // 非致命：创建仍成功，可后续 suggest / 手动填写
          }
        }

        const result = {
          ...created,
          requestParameterInterface:
            created.requestParameterInterface || interfaceText || created.requestParameterInterface,
          _normalizedCode: serviceCode,
          _resolvedConnection: resolved,
          _enabledOperations: enabledOperations,
          _requestInterfaceAutoGenerated: autoGenerated,
          _responseOverridesAutoGenerated: responseOverridesAutoGenerated,
        };

        const hasEntityRef = Boolean(entityIdForIface || entityCodesForIface?.length);
        const requireFindPagination = primaryOperation === 'find';
        const verifyOpts = {
          expectedCode: undefined as string | undefined,
          requireRequestParameterInterface: hasEntityRef,
          requireFindPaginationDocs: requireFindPagination,
        };

        if (args.publish === true) {
          const pubRes = await postApiServicePublish(created.id, { skipErrorHandler: true });
          const published = getApiData<API.ApiService>(pubRes);
          if (!published?.id) throw new Error('创建成功但发布失败');
          const verified = await verifyApiServiceById(published.id, {
            expectedCode: serviceCode,
            expectedStatus: 'published',
            requireRequestParameterInterface: hasEntityRef,
            requireFindPaginationDocs: requireFindPagination,
          });
          const listed = await verifyApiServiceListed(verified.code, { expectedStatus: 'published' });
          const docs = assessRequestParameterInterface(published);
          const paginationDocs = assessFindPaginationResponseDocs(published, primaryOperation);
          const allVerified =
            verified.verified
            && listed.verified
            && docs.requestDocsComplete
            && paginationDocs.hasPaginationDocs;
          return {
            ...published,
            _resolvedConnection: resolved,
            _requestInterfaceAutoGenerated: autoGenerated,
            _responseOverridesAutoGenerated: responseOverridesAutoGenerated,
            _verification: {
              ...verified,
              listedInApiList: listed.verified,
              hasRequestParameterInterface: docs.hasRequestParameterInterface,
              requestDocsComplete: docs.requestDocsComplete,
              hasPaginationDocs: paginationDocs.hasPaginationDocs,
              verified: allVerified,
              message: allVerified
                ? verified.message
                : [listed.message, verified.message, docs.message, paginationDocs.message]
                    .filter(Boolean)
                    .join('；'),
            },
          };
        }

        const verified = await verifyApiServiceById(created.id, {
          ...verifyOpts,
          // 后端可能改写 code（scope+slug）；以回读为准，不强制 expectedCode 与前端猜测一致
        });
        const listed = await verifyApiServiceListed(verified.code);
        const docs = {
          hasRequestParameterInterface: verified.hasRequestParameterInterface,
          requestDocsComplete: verified.requestDocsComplete,
          message: verified.requestDocsComplete
            ? undefined
            : 'requestParameterInterface 为空；编辑页「请求参数结构」将显示为空',
        };
        const paginationDocs = assessFindPaginationResponseDocs(
          {
            ...created,
            securityConfig: {
              ...(created.securityConfig || {}),
              responseOverrides: ensuredResponseOverrides,
            },
          },
          primaryOperation,
        );
        const allVerified =
          verified.verified
          && listed.verified
          && (!hasEntityRef || Boolean(docs.requestDocsComplete))
          && (!requireFindPagination || paginationDocs.hasPaginationDocs);
        return {
          ...result,
          code: verified.code,
          requestParameterInterface: result.requestParameterInterface || interfaceText || '',
          _verification: {
            ...verified,
            listedInApiList: listed.verified,
            hasRequestParameterInterface: docs.hasRequestParameterInterface,
            requestDocsComplete: Boolean(docs.requestDocsComplete),
            hasPaginationDocs: paginationDocs.hasPaginationDocs,
            verified: allVerified,
            message: allVerified
              ? `已创建 draft 服务「${verified.code}」（未发布；发布须 apiservice_publish_service）${
                  autoGenerated || responseOverridesAutoGenerated
                    ? '；已自动补全请求/响应文档'
                    : ''
                }`
              : [
                  `已创建 draft「${verified.code}」但文档不完整`,
                  docs.message,
                  paginationDocs.message,
                  '请用 apiservice_update_service 补全 requestParameterInterface / responseOverrides（含 pagination）',
                ]
                  .filter(Boolean)
                  .join('；'),
          },
        };
      },
    }),
  });

  registerFunctionCall({
    name: 'apiservice_create_services_batch',
    description:
      '批量创建 API 服务（如 CRUD 全套）。每个服务一个 operation；可传 entityCode 自动生成 find/create/updateOne/deleteOne。connectionId/targetSchema 省略时按实体物化记录推断，新实体尚未物化则用同域已物化实体的 schema',
    requiresVerification: true,
    parameters: {
      type: 'object',
      properties: {
        entityCode: { type: 'string', description: '实体 code，如 equipment:Device' },
        entityId: { type: 'string' },
        entityCodes: { type: 'array', items: { type: 'string' } },
        scopeCode: { type: 'string', description: '仅用于推断连接' },
        connectionId: { type: 'string', description: '可选，省略时自动推断' },
        operations: {
          type: 'array',
          items: { type: 'string' },
          description: `默认 CRUD: ${DEFAULT_CRUD_OPERATIONS.join(', ')}`,
        },
        namePrefix: { type: 'string', description: '服务显示名称前缀，如「设备资料」' },
        tags: { type: 'array', items: { type: 'string' } },
        publish: { type: 'boolean' },
        services: {
          type: 'array',
          description: '显式服务列表（每项一个 operation），提供时忽略 operations 自动生成',
          items: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              name: { type: 'string' },
              operation: { type: 'string' },
              definitionScript: { type: 'string' },
            },
          },
        },
      },
    },
    handler: createMutatingHandler({
      domain: API_SERVICE_DOMAIN,
      type: 'apiservice.batch_created',
      scope: LIST_SURFACE,
      buildPayload: (_args, data) => data,
      handler: async (args) =>
        executeBatchCreateServices({
          connectionId: args.connectionId as string | undefined,
          scopeCode: args.scopeCode as string | undefined,
          entityCode: args.entityCode as string | undefined,
          entityId: args.entityId as string | undefined,
          entityCodes: args.entityCodes as string[] | undefined,
          operations: args.operations as string[] | undefined,
          namePrefix: args.namePrefix as string | undefined,
          tags: args.tags as string[] | undefined,
          publish: args.publish === true,
          services: args.services as BatchCreateArgs['services'],
        }),
    }),
  });

  registerFunctionCall({
    name: 'apiservice_check_handler',
    description:
      '检查 TypeScript Handler 语法/类型（行级诊断）。保存或测试前必须先调用且 ok=true；禁止 queryPg/手写 SQL',
    parameters: {
      type: 'object',
      properties: {
        handlerScript: { type: 'string', description: 'Handler 脚本（推荐只写函数体）' },
        requestParameterInterface: {
          type: 'string',
          description: '请求参数 TS interface，用于 params 类型',
        },
      },
      required: ['handlerScript'],
    },
    handler: async (args) => {
      const res = await postApiServiceCheckHandler({
        handlerScript: String(args.handlerScript || ''),
        requestParameterInterface: args.requestParameterInterface
          ? String(args.requestParameterInterface)
          : undefined,
      });
      const data = getApiData<{
        ok: boolean;
        diagnostics: Array<{ line: number; column: number; message: string }>;
      }>(res);
      return data || { ok: false, diagnostics: [{ line: 1, column: 1, message: '检查失败' }] };
    },
  });

  registerFunctionCall({
    name: 'apiservice_update_service',
    description:
      '更新 API 服务。定位优先 serviceId，或 code，或 scopeCode+serviceSlug（勿用实体 code）。补请求结构须传非空 requestParameterInterface',
    parameters: {
      type: 'object',
      properties: {
        serviceId: { type: 'string', description: '优先：create 返回的 id' },
        code: { type: 'string', description: '服务 code（非实体 code）' },
        name: { type: 'string' },
        description: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        connectionId: { type: 'string' },
        scopeCode: { type: 'string', description: '可与 serviceSlug 一起定位服务' },
        serviceSlug: { type: 'string', description: '可与 scopeCode 一起定位服务' },
        definitionScript: { type: 'string' },
        handlerScript: { type: 'string' },
        scriptMode: { type: 'string', enum: ['sql', 'typescript'] },
        requestParameterInterface: {
          type: 'string',
          description: '设计期 TS interface；编辑页「请求参数结构」来源，须非空才算补全',
        },
        accessRestriction: {
          type: 'object',
          properties: {
            mode: { type: 'string', enum: ['none', 'role', 'department'] },
            roleIds: { type: 'array', items: { type: 'string' } },
            departmentIds: { type: 'array', items: { type: 'string' } },
          },
        },
        enabledOperations: { type: 'array', items: { type: 'string' } },
        transportProtocols: {
          type: 'array',
          items: { type: 'string', enum: ['http', 'sse', 'websocket'] },
        },
        responseOverrides: {
          type: 'object',
          description: '按 operation 覆盖 { responsesSchema, responseExample }；Example 禁止 item:null 占位',
        },
        requestOverrides: {
          type: 'object',
          description: '按 operation 保存请求参数 Example（与测试 mock 同源），须含具体示例值而非空结构',
        },
      },
    },
    handler: createMutatingHandler({
      domain: API_SERVICE_DOMAIN,
      type: 'apiservice.updated',
      buildResourceId: (_args, data) => (data as API.ApiService)?.id,
      handler: async (args) => {
        const serviceId = await resolveApiServiceId(args as Record<string, unknown>);
        const beforeRes = await getApiService(serviceId);
        const before = getApiData<API.ApiService>(beforeRes);
        const body: Partial<API.ApiServiceCreateInput> = {};
        if (args.name !== undefined) body.name = String(args.name);
        if (args.description !== undefined) body.description = String(args.description);
        if (args.tags !== undefined) body.tags = args.tags as string[];
        // scope/slug 仅用于定位时不要写入 body 改码；仅当显式要改且同时有 code 意图时才 patch
        // 若 args 同时带 scopeCode+serviceSlug 且无 serviceId/code，resolve 已用它们定位；避免误改 code
        const locatingOnly =
          !args.serviceId &&
          !args.code &&
          args.scopeCode !== undefined &&
          args.serviceSlug !== undefined;
        if (args.scopeCode !== undefined && !locatingOnly) body.scopeCode = String(args.scopeCode);
        if (args.serviceSlug !== undefined && !locatingOnly) body.serviceSlug = String(args.serviceSlug);
        if (args.connectionId !== undefined) body.connectionId = String(args.connectionId);
        if (args.scriptMode !== undefined) {
          body.scriptMode = args.scriptMode === 'typescript' ? 'typescript' : 'sql';
        }
        if (args.definitionScript !== undefined) body.definitionScript = String(args.definitionScript);
        if (args.handlerScript !== undefined) body.handlerScript = String(args.handlerScript);
        if (args.requestParameterInterface !== undefined) {
          body.requestParameterInterface = String(args.requestParameterInterface);
        }
        if (args.accessRestriction !== undefined) {
          body.accessRestriction = args.accessRestriction as API.ApiServiceAccessRestriction;
        }
        if (args.enabledOperations !== undefined) {
          body.enabledOperations = args.enabledOperations as string[];
        }
        if (args.transportProtocols !== undefined) {
          body.transportProtocols = args.transportProtocols as Array<'http' | 'sse' | 'websocket'>;
        }

        const primaryOp = String(
          (Array.isArray(args.enabledOperations) ? (args.enabledOperations as string[])[0] : undefined)
            || before?.enabledOperations?.[0]
            || '',
        ).trim();
        const existingOverrides = (before?.securityConfig as Record<string, unknown> | undefined)
          ?.responseOverrides as Record<
            string,
            { responsesSchema?: Record<string, unknown>; responseExample?: unknown }
          > | undefined;
        const shouldEnsureResponse =
          args.responseOverrides !== undefined
          || primaryOp === 'find';
        if (shouldEnsureResponse) {
          const { overrides } = ensureResponseOverridesForOperation({
            operation: primaryOp || 'find',
            entityCode: before?.entityCode,
            requestParameterInterface:
              body.requestParameterInterface
              || before?.requestParameterInterface
              || undefined,
            responseOverrides: (args.responseOverrides as typeof existingOverrides)
              || existingOverrides,
          });
          body.responseOverrides = overrides as API.ApiServiceCreateInput['responseOverrides'];
        }

        if (args.requestOverrides !== undefined) {
          body.requestOverrides = args.requestOverrides as API.ApiServiceCreateInput['requestOverrides'];
        }
        const res = await patchApiService(serviceId, body);
        const data = getApiData<API.ApiService>(res);
        if (!data) throw new Error('更新 API 服务失败');

        const docs = assessRequestParameterInterface(data);
        const paginationDocs = assessFindPaginationResponseDocs(data, data.enabledOperations?.[0]);
        const touchedIface = args.requestParameterInterface !== undefined;
        const requirePagination = (data.enabledOperations?.[0] || primaryOp) === 'find';
        const verifiedOk =
          (!touchedIface || docs.requestDocsComplete)
          && (!requirePagination || paginationDocs.hasPaginationDocs);
        return {
          ...data,
          _verification: {
            verified: verifiedOk,
            id: data.id,
            code: data.code,
            hasRequestParameterInterface: docs.hasRequestParameterInterface,
            requestDocsComplete: docs.requestDocsComplete,
            hasPaginationDocs: paginationDocs.hasPaginationDocs,
            message: verifiedOk
              ? `已更新服务「${data.code}」`
              : [docs.message, paginationDocs.message].filter(Boolean).join('；')
                || `已更新服务「${data.code}」但文档不完整`,
          },
        };
      },
    }),
  });

  registerFunctionCall({
    name: 'apiservice_publish_service',
    description:
      '发布 API 服务（draft→published）。成功后信封须 verified=true 且 status=published；禁止用 run_test 代替本 Tool',
    requiresVerification: true,
        parameters: {
      type: 'object',
      properties: {
        serviceId: { type: 'string' },
        code: { type: 'string' },
        scopeCode: { type: 'string' },
        serviceSlug: { type: 'string' },
      },
    },
    handler: createMutatingHandler({
      domain: API_SERVICE_DOMAIN,
      type: 'apiservice.published',
      scope: LIST_SURFACE,
      buildResourceId: (_args, data) => (data as API.ApiService)?.id,
      handler: async (args) => {
        const serviceId = await resolveApiServiceId(args as Record<string, unknown>);
        const code = args.code ? String(args.code).trim() : undefined;
        const before = await verifyApiServiceById(serviceId, { expectedCode: code });

        if (before.status === 'published') {
          return {
            success: false,
            verified: false,
            alreadyPublished: true,
            error: `服务「${before.code}」已是 published，未产生 draft→published 变更。请用 apiservice_list_draft_services 获取待发布列表`,
            serviceId,
            code: before.code,
            status: before.status,
          };
        }

        if (before.status === 'disabled') {
          return {
            success: false,
            verified: false,
            error: `服务「${before.code}」为 disabled，无法直接发布`,
            serviceId,
            code: before.code,
            status: before.status,
          };
        }

        try {
          const pubRes = await postApiServicePublish(serviceId, { skipErrorHandler: true });
          const data = getApiData<API.ApiService>(pubRes);
          if (!data?.id) throw new Error('发布失败：接口未返回服务');
          const verified = await verifyApiServicePublished(data.id, code || data.code);
          const listed = await verifyApiServiceListed(verified.code, { expectedStatus: 'published' });
          return {
            ...data,
            previousStatus: before.status || 'draft',
            _verification: {
              ...verified,
              listedInApiList: listed.verified,
              verified: verified.verified && listed.verified,
              statusTransition: `${before.status || 'draft'}→published`,
              message:
                verified.verified && listed.verified
                  ? verified.message
                  : listed.message || verified.message,
            },
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : '发布失败';
          return {
            success: false,
            verified: false,
            error: message,
            serviceId,
            code: before.code,
            previousStatus: before.status,
          };
        }
      },
    }),
  });


  registerFunctionCall({
    name: 'apiservice_disable_service',
    description:
      '禁用已发布的 API 服务（published→disabled）。成功后信封须 verified=true 且 status=disabled',
    requiresVerification: true,
    parameters: {
      type: 'object',
      properties: {
        serviceId: { type: 'string' },
        code: { type: 'string' },
        scopeCode: { type: 'string' },
        serviceSlug: { type: 'string' },
      },
    },
    handler: createMutatingHandler({
      domain: API_SERVICE_DOMAIN,
      type: 'apiservice.disabled',
      scope: LIST_SURFACE,
      buildResourceId: (_args, data) => (data as API.ApiService)?.id,
      handler: async (args) => {
        const serviceId = await resolveApiServiceId(args as Record<string, unknown>);
        const code = args.code ? String(args.code).trim() : undefined;
        const before = await verifyApiServiceById(serviceId, { expectedCode: code });

        if (before.status === 'disabled') {
          return {
            success: false,
            verified: false,
            alreadyDisabled: true,
            error: `服务「${before.code}」已是 disabled，未产生状态变更`,
            serviceId,
            code: before.code,
            status: before.status,
          };
        }

        if (before.status !== 'published') {
          return {
            success: false,
            verified: false,
            error: `服务「${before.code}」当前为 ${before.status || '未知'}，仅 published 可禁用`,
            serviceId,
            code: before.code,
            status: before.status,
          };
        }

        try {
          const disableRes = await postApiServiceDisable(serviceId);
          const data = getApiData<API.ApiService>(disableRes);
          if (!data?.id) throw new Error('禁用失败：接口未返回服务');
          const verified = await verifyApiServiceById(data.id, {
            expectedCode: code || data.code,
            expectedStatus: 'disabled',
          });
          const listed = await verifyApiServiceListed(verified.code, { expectedStatus: 'disabled' });
          return {
            ...data,
            previousStatus: before.status || 'published',
            _verification: {
              ...verified,
              listedInApiList: listed.verified,
              verified: verified.verified && listed.verified && data.status === 'disabled',
              statusTransition: `${before.status || 'published'}→disabled`,
              message:
                verified.verified && listed.verified
                  ? verified.message
                  : listed.message || verified.message,
            },
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : '禁用失败';
          return {
            success: false,
            verified: false,
            error: message,
            serviceId,
            code: before.code,
            previousStatus: before.status,
          };
        }
      },
    }),
  });

  registerFunctionCall({
    name: 'apiservice_delete_service',
    description: '删除 API 服务',
    parameters: {
      type: 'object',
      properties: {
        serviceId: { type: 'string' },
        code: { type: 'string' },
      },
    },
    handler: createMutatingHandler({
      domain: API_SERVICE_DOMAIN,
      type: 'apiservice.deleted',
      scope: LIST_SURFACE,
      buildResourceId: (args) => String(args.serviceId || args.code || ''),
      buildPayload: () => ({ success: true }),
      handler: async (args) => {
        const serviceId = await resolveApiServiceId(args as Record<string, unknown>);
        await deleteApiService(serviceId);
        return { success: true, serviceId };
      },
    }),
  });

  registerFunctionCall({
    name: 'apiservice_list_operations',
    description: '获取 operation 目录',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      const res = await getApiServiceOperationCatalog();
      return getApiData(res);
    },
  });

  registerFunctionCall({
    name: 'apiservice_get_tree',
    description: '获取 API 服务域树；禁止用于实体/API 覆盖率对比',
    parameters: {
      type: 'object',
      properties: {
        codePrefix: { type: 'string' },
      },
    },
    handler: async (args) => {
      const res = await getApiServiceTree({
        codePrefix: args.codePrefix as string,
      });
      return getApiData(res);
    },
  });

  registerFunctionCall({
    name: 'apiservice_get_test_profile',
    description: '获取 API 服务测试上下文（参数结构、mock 参数、请求预览）',
    parameters: {
      type: 'object',
      properties: {
        serviceId: { type: 'string' },
        code: { type: 'string' },
      },
    },
    handler: async (args) => {
      const serviceId = await resolveApiServiceId(args as Record<string, unknown>);
      const res = await getApiServiceTestProfile(serviceId);
      return getApiData(res);
    },
  });

  registerFunctionCall({
    name: 'apiservice_suggest_test_params',
    description: '生成并保存请求参数 Example（与编辑页/测试页 mock 同源），并同步到测试页表单',
    parameters: {
      type: 'object',
      properties: {
        serviceId: { type: 'string' },
        code: { type: 'string' },
        operation: { type: 'string', description: '如 find、create、updateOne' },
      },
    },
    handler: createMutatingHandler({
      domain: API_SERVICE_DOMAIN,
      type: 'apiservice.test_params.suggested',
      scope: TEST_SURFACE,
      buildResourceId: (args) => String(args.serviceId || args.code || ''),
      buildPayload: (_args, data) => data,
      handler: async (args) => {
        const serviceId = await resolveApiServiceId(args as Record<string, unknown>);
        const res = await postApiServiceSuggestTestParams(serviceId, {
          operation: args.operation as string | undefined,
        });
        const data = getApiData<API.ApiServiceSuggestTestParamsResult>(res);
        if (!data) throw new Error('生成模拟参数失败');
        const operation = data.operation || String(args.operation || '').trim();
        if (operation && data.mockParameters) {
          const saveRes = await putApiServiceTestMockParams(serviceId, {
            operation,
            mockParameters: data.mockParameters,
          });
          if (!isApiSuccess(saveRes)) {
            throw new Error(formatApiServiceTestError(saveRes, '保存请求参数 Example 失败'));
          }
        }
        return {
          ...data,
          saved: true,
        };
      },
    }),
  });

  registerFunctionCall({
    name: 'apiservice_set_test_params',
    description: '保存请求参数 Example（与编辑页一致，持久化到 requestOverrides），并同步测试页表单',
    parameters: {
      type: 'object',
      properties: {
        serviceId: { type: 'string' },
        code: { type: 'string' },
        operation: { type: 'string', description: '必填，如 create、find' },
        parameters: { type: 'object', description: '完整 mock 参数 JSON 对象' },
        mockParameters: { type: 'object', description: '同 parameters，二选一' },
      },
      required: ['operation'],
    },
    handler: createMutatingHandler({
      domain: API_SERVICE_DOMAIN,
      type: 'apiservice.test_params.set',
      scope: TEST_SURFACE,
      buildResourceId: (args) => String(args.serviceId || args.code || ''),
      buildPayload: (_args, data) => data,
      handler: async (args) => {
        const serviceId = await resolveApiServiceId(args as Record<string, unknown>);
        const operation = args.operation ? String(args.operation).trim() : '';
        if (!operation) {
          throw new Error('operation 必填');
        }
        const mockParameters = (args.parameters || args.mockParameters) as Record<string, unknown> | undefined;
        if (!mockParameters || typeof mockParameters !== 'object') {
          throw new Error('parameters / mockParameters 必须为对象');
        }
        const res = await putApiServiceTestMockParams(serviceId, { operation, mockParameters });
        if (!isApiSuccess(res)) {
          throw new Error(formatApiServiceTestError(res, '保存模拟参数失败'));
        }
        const data = getApiData<API.ApiServiceSaveTestMockParamsResult>(res);
        return {
          operation,
          mockParameters: data?.mockParameters || mockParameters,
          saved: true,
        };
      },
    }),
  });

  registerFunctionCall({
    name: 'apiservice_run_test',
    description: '使用指定 operation 与 parameters 执行 API 服务测试（写操作事务回滚）；结果同步到测试页',
    requiresVerification: true,
    parameters: {
      type: 'object',
      properties: {
        serviceId: { type: 'string' },
        code: { type: 'string' },
        operation: { type: 'string' },
        parameters: { type: 'object', description: '测试参数 JSON' },
      },
      required: ['operation'],
    },
    handler: createMutatingHandler({
      domain: API_SERVICE_DOMAIN,
      type: 'apiservice.test_completed',
      scope: TEST_SURFACE,
      buildResourceId: (args) => String(args.serviceId || args.code || ''),
      buildPayload: (_args, data) => data,
      handler: async (args) => {
        const serviceId = await resolveApiServiceId(args as Record<string, unknown>);
        const code = args.code ? String(args.code).trim() : undefined;
        if (code) {
          await verifyApiServiceListed(code);
        }
        try {
          const res = await postApiServiceTest(
            serviceId,
            {
              operation: args.operation as string,
              parameters: (args.parameters as Record<string, unknown>) || {},
            },
            { skipErrorHandler: true },
          );
          if (isApiSuccess(res)) {
            const data = getApiData<API.ApiServiceTestResult>(res);
            if (!data) throw new Error('测试请求失败');
            const failureMessage = describeApiServiceTestFailure(data);
            if (isApiServiceTestFailure(data)) {
              return {
                success: false,
                verified: false,
                error: failureMessage || '测试未通过',
                ...data,
              };
            }
            const parameters = (args.parameters as Record<string, unknown>) || {};
            const operation = String(args.operation || data.operation || '');
            let savedMockParameters = data.savedMockParameters;
            if (
              data.executable !== false
              && operation
              && Object.keys(parameters).length > 0
              && !savedMockParameters
            ) {
              const saveRes = await putApiServiceTestMockParams(serviceId, {
                operation,
                mockParameters: parameters,
              });
              if (isApiSuccess(saveRes)) {
                const saved = getApiData<API.ApiServiceSaveTestMockParamsResult>(saveRes);
                savedMockParameters = saved?.mockParameters || parameters;
              }
            }
            return {
              success: true,
              verified: true,
              ...data,
              mockParametersSaved: data.mockParametersSaved ?? Boolean(savedMockParameters),
              savedMockParameters: savedMockParameters || parameters,
              operation: operation || data.operation,
            };
          }
          const error = formatApiServiceTestError(res);
          return {
            success: false,
            verified: false,
            error,
            validationErrors: extractApiServiceValidationErrors(res),
          };
        } catch (err) {
          return {
            success: false,
            error: formatApiServiceTestError(err),
            validationErrors: extractApiServiceValidationErrors(err),
          };
        }
      },
    }),
  });

  registerFunctionCall({
    name: 'apiservice_navigate',
    description: '在 API 服务相关页面间跳转：create / edit / test / list；工作流页内禁止跳 list',
    parameters: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          enum: ['list', 'create', 'edit', 'test'],
          description: '目标页面；在 create/edit/test 流程中请使用 create/edit/test 互跳',
        },
        serviceId: { type: 'string' },
        code: { type: 'string' },
        autoRunTest: { type: 'boolean', description: '跳转到 test 页后是否自动执行测试' },
        fixContext: {
          type: 'object',
          description: '传递给测试页的修复上下文，如 { errorMessage }',
        },
      },
      required: ['target'],
    },
    handler: createMutatingHandler({
      domain: API_SERVICE_DOMAIN,
      type: 'apiservice.navigate',
      buildPayload: (_args, data) => data,
      handler: async (args) => {
        const target = String(args.target || 'list');
        let resolvedServiceId: string | undefined;
        if (args.serviceId || args.code) {
          resolvedServiceId = await resolveApiServiceId(args as Record<string, unknown>);
        }

        const path = resolveApiServiceNavigateTarget(
          target,
          resolvedServiceId,
          window.location.pathname,
        );

        const payload = {
          target,
          serviceId: resolvedServiceId || undefined,
          path,
          autoRunTest: args.autoRunTest === true,
          fixContext: args.fixContext as Record<string, unknown> | undefined,
        };

        history.push(path, {
          autoRunTest: payload.autoRunTest,
          fixContext: payload.fixContext,
          fromAutoFix: true,
        });

        return payload;
      },
    }),
  });

  // ========== 异常响应模板（全局共享）==========

  registerFunctionCall({
    name: 'apiservice_list_exception_responses',
    description: '列出全部异常响应模板（全局共享），返回 items[].{id,code,title,description,schema,example,isEnabled}',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      const res = await getExceptionResponses({ size: -1 });
      if (!isApiSuccess(res)) throw new Error('获取异常响应列表失败');
      return getApiData(res);
    },
  });

  registerFunctionCall({
    name: 'apiservice_create_exception_response',
    description: '新建一条异常响应模板。code 必须唯一（401/403/404/500 等）。schema 为 JSON Schema，example 为示例响应体。',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'integer', description: 'HTTP 状态码（如 401）' },
        title: { type: 'string', description: '简短标题（如「未授权」）' },
        description: { type: 'string', description: '详细说明' },
        schema: { type: 'object', description: '响应体 JSON Schema' },
        example: { type: 'object', description: '响应示例' },
        isEnabled: { type: 'boolean', description: '是否启用，默认 true' },
        sortOrder: { type: 'integer', description: '排序值，默认 0' },
      },
      required: ['code', 'title'],
    },
    handler: createMutatingHandler({
      domain: API_SERVICE_DOMAIN,
      type: 'apiservice.exception_response.created',
      scope: EXCEPTION_RESPONSES_SURFACE,
      buildResourceId: (_args, data) => (data as API.ExceptionResponseItem)?.id,
      handler: async (args) => {
        const res = await createExceptionResponse({
          code: Number(args.code),
          title: String(args.title || '').trim(),
          description: args.description ? String(args.description) : undefined,
          schema: (args.schema as Record<string, unknown>) || {},
          example: args.example,
          isEnabled: args.isEnabled !== false,
          sortOrder: Number(args.sortOrder) || 0,
        });
        if (!isApiSuccess(res)) throw new Error(res.message || '创建异常响应失败');
        return getApiData(res);
      },
    }),
  });

  registerFunctionCall({
    name: 'apiservice_update_exception_response',
    description: '更新一条异常响应模板（按 id 或 code 匹配）。',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '异常响应 ID' },
        code: { type: 'integer', description: '用于查找的 code（无 id 时）' },
        title: { type: 'string' },
        description: { type: 'string' },
        schema: { type: 'object', description: '响应体 JSON Schema' },
        example: { type: 'object', description: '响应示例' },
        isEnabled: { type: 'boolean' },
        sortOrder: { type: 'integer' },
      },
    },
    handler: createMutatingHandler({
      domain: API_SERVICE_DOMAIN,
      type: 'apiservice.exception_response.updated',
      scope: EXCEPTION_RESPONSES_SURFACE,
      buildResourceId: (args, data) => (data as API.ExceptionResponseItem)?.id || (args.id as string),
      handler: async (args) => {
        let id = args.id as string | undefined;
        if (!id && args.code != null) {
          const listRes = await getExceptionResponses({ size: -1 });
          if (isApiSuccess(listRes)) {
            const found = getApiData(listRes)?.items.find((item) => item.code === Number(args.code));
            if (found) id = found.id;
          }
        }
        if (!id) throw new Error('未提供 id 且无法按 code 找到记录');
        const patch: Record<string, unknown> = {};
        if (args.title != null) patch.title = String(args.title);
        if (args.description !== undefined) patch.description = args.description;
        if (args.schema !== undefined) patch.schema = args.schema;
        if (args.example !== undefined) patch.example = args.example;
        if (args.isEnabled !== undefined) patch.isEnabled = args.isEnabled;
        if (args.sortOrder !== undefined) patch.sortOrder = Number(args.sortOrder);
        const res = await patchExceptionResponse(id, patch);
        if (!isApiSuccess(res)) throw new Error(res.message || '更新异常响应失败');
        return getApiData(res);
      },
    }),
  });

  registerFunctionCall({
    name: 'apiservice_delete_exception_response',
    description: '删除一条异常响应模板（按 id 或 code 匹配）。',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '异常响应 ID' },
        code: { type: 'integer', description: '用于查找的 code（无 id 时）' },
      },
    },
    handler: createMutatingHandler({
      domain: API_SERVICE_DOMAIN,
      type: 'apiservice.exception_response.deleted',
      scope: EXCEPTION_RESPONSES_SURFACE,
      buildResourceId: (args) => (args.id as string) || String(args.code),
      handler: async (args) => {
        let id = args.id as string | undefined;
        if (!id && args.code != null) {
          const listRes = await getExceptionResponses({ size: -1 });
          if (isApiSuccess(listRes)) {
            const found = getApiData(listRes)?.items.find((item) => item.code === Number(args.code));
            if (found) id = found.id;
          }
        }
        if (!id) throw new Error('未提供 id 且无法按 code 找到记录');
        const res = await deleteExceptionResponse(id);
        if (!isApiSuccess(res)) throw new Error(res.message || '删除异常响应失败');
        return { id, deleted: true };
      },
    }),
  });
}

export function unregisterApiServiceTools() {
  TOOL_NAMES.forEach((name) => unregisterFunctionCall(name));
}
