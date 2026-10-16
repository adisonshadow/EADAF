// @ts-ignore
import { request } from '@/utils/request';

const BASE = '/api/v1/business-data';

export async function getBusinessDataScopes() {
  return request<{
    code: number;
    message: string;
    data: { tree: API.BizdataScopeOption[]; items: API.BizdataScopeOption[] };
  }>(`${BASE}/scopes`, { method: 'GET' });
}

export async function getBusinessDataScopeExists(params: { code: string }) {
  return request<{
    code: number;
    message: string;
    data: API.BusinessDataExistsResult<API.BizdataScopeOption> & { entityCount?: number };
  }>(`${BASE}/scopes/exists`, {
    method: 'GET',
    params,
  });
}

export async function getBusinessDataScopeDocs(params?: { codes?: string }) {
  return request<{
    code: number;
    message: string;
    data: API.BusinessDataScopeDocSummary[];
  }>(`${BASE}/scope-docs`, {
    method: 'GET',
    params,
  });
}

export async function getBusinessDataScopeDoc(params: {
  code: string;
  includeAncestors?: boolean | '0' | '1' | 'true' | 'false';
}) {
  return request<{
    code: number;
    message: string;
    data: API.BusinessDataScopeDoc;
  }>(`${BASE}/scope-docs/content`, {
    method: 'GET',
    params: {
      code: params.code,
      ...(params.includeAncestors != null
        ? {
            includeAncestors:
              params.includeAncestors === true || params.includeAncestors === '1' || params.includeAncestors === 'true'
                ? '1'
                : '0',
          }
        : {}),
    },
  });
}

export async function putBusinessDataScopeDoc(body: { code: string; contentMarkdown?: string }) {
  return request<{
    code: number;
    message: string;
    data: API.BusinessDataScopeDoc;
  }>(`${BASE}/scope-docs`, {
    method: 'PUT',
    data: body,
  });
}

export async function getBusinessDataSchema(options?: Record<string, unknown>) {
  return request<{ code: number; message: string; data: API.BusinessDataSchema }>(`${BASE}/schema`, {
    method: 'GET',
    ...(options || {}),
  });
}

export async function getBusinessDataEntities(params?: {
  codePrefix?: string;
  entityKind?: string;
  page?: number;
  size?: number;
  summary?: boolean;
}) {
  return request<{ code: number; message: string; data: API.BusinessDataEntityList }>(`${BASE}/entities`, {
    method: 'GET',
    params,
  });
}

export async function getBusinessDataEntityExists(params: { code: string }) {
  return request<{
    code: number;
    message: string;
    data: API.BusinessDataExistsResult<API.BusinessDataEntity>;
  }>(`${BASE}/entities/exists`, {
    method: 'GET',
    params,
  });
}

export async function getBusinessDataEntity(id: string) {
  return request<{ code: number; message: string; data: API.BusinessDataEntity }>(`${BASE}/entities/${id}`, {
    method: 'GET',
  });
}

export async function postBusinessDataEntity(body: Partial<API.BusinessDataEntity>) {
  return request<{ code: number; message: string; data: API.BusinessDataEntity }>(`${BASE}/entities`, {
    method: 'POST',
    data: body,
  });
}

export async function patchBusinessDataEntity(id: string, body: Partial<API.BusinessDataEntity>) {
  return request<{ code: number; message: string; data: API.BusinessDataEntity }>(`${BASE}/entities/${id}`, {
    method: 'PATCH',
    data: body,
  });
}

export async function deleteBusinessDataEntity(id: string) {
  return request<{ code: number; message: string; data: null }>(`${BASE}/entities/${id}`, {
    method: 'DELETE',
  });
}

export async function postEntityDeletionAnalysis(id: string) {
  return request<{ code: number; message: string; data: API.EntityDeletionAnalysis }>(
    `${BASE}/entities/${id}/deletion-analysis`,
    { method: 'POST' },
  );
}

export async function postEntityDeletionExecute(body: {
  deleteEntityIds: string[];
  dropPhysicalTables?: boolean;
}) {
  return request<{ code: number; message: string; data: API.EntityDeletionExecuteResult }>(
    `${BASE}/entities/deletion-execute`,
    { method: 'POST', data: body },
  );
}

export async function putBusinessDataEntityFields(id: string, fields: API.BusinessDataField[]) {
  return request<{ code: number; message: string; data: API.BusinessDataEntity }>(
    `${BASE}/entities/${id}/fields`,
    { method: 'PUT', data: { fields } },
  );
}

export async function getBusinessDataEnums(params?: { page?: number; size?: number }) {
  return request<{ code: number; message: string; data: { total: number; items: API.BusinessDataEnum[] } }>(
    `${BASE}/enums`,
    { method: 'GET', params },
  );
}

export async function getBusinessDataEnumExists(params: { code: string }) {
  return request<{
    code: number;
    message: string;
    data: API.BusinessDataExistsResult<API.BusinessDataEnum>;
  }>(`${BASE}/enums/exists`, {
    method: 'GET',
    params,
  });
}

export async function postBusinessDataEnum(body: Partial<API.BusinessDataEnum>) {
  return request<{ code: number; message: string; data: API.BusinessDataEnum }>(`${BASE}/enums`, {
    method: 'POST',
    data: body,
  });
}

export async function patchBusinessDataEnum(id: string, body: Partial<API.BusinessDataEnum>) {
  return request<{ code: number; message: string; data: API.BusinessDataEnum }>(`${BASE}/enums/${id}`, {
    method: 'PATCH',
    data: body,
  });
}

export async function deleteBusinessDataEnum(id: string) {
  return request<{ code: number; message: string; data: null }>(`${BASE}/enums/${id}`, {
    method: 'DELETE',
  });
}

export async function getBusinessDataRelations(params?: {
  entityCode?: string;
  entityId?: string;
}) {
  return request<{ code: number; message: string; data: API.BusinessDataRelation[] }>(`${BASE}/relations`, {
    method: 'GET',
    params,
  });
}

export async function postBusinessDataRelation(body: Partial<API.BusinessDataRelation>) {
  return request<{ code: number; message: string; data: API.BusinessDataRelation }>(`${BASE}/relations`, {
    method: 'POST',
    data: body,
  });
}

export async function deleteBusinessDataRelation(id: string) {
  return request<{ code: number; message: string; data: null }>(`${BASE}/relations/${id}`, {
    method: 'DELETE',
  });
}

export async function postMaterializationPreview(body: {
  entityIds?: string[];
  targetSchema?: string;
  connectionId?: string;
}) {
  return request<{ code: number; message: string; data: API.MaterializationPreview }>(
    `${BASE}/materialization/preview`,
    { method: 'POST', data: body },
  );
}

import type { RequestOptions } from '@/utils/request';

export async function postMaterializationExecute(
  body: {
    entityIds?: string[];
    targetSchema?: string;
    connectionId?: string;
    dryRun?: boolean;
    createTargetIfMissing?: boolean;
    expectedVersions?: Record<string, number>;
  },
  options?: RequestOptions,
) {
  return request<{ code: number; message: string; data: API.MaterializationExecuteResult }>(
    `${BASE}/materialization/execute`,
    { method: 'POST', data: body, ...options },
  );
}

export async function getMaterializationStatus(params?: {
  connectionId?: string;
  entityCodes?: string | string[];
  entityIds?: string | string[];
  entityCode?: string;
  entityId?: string;
}) {
  return request<{ code: number; message: string; data: API.MaterializationStatusItem[] }>(
    `${BASE}/materialization/status`,
    { method: 'GET', params },
  );
}

export async function getMaterializationRuns(params?: {
  page?: number;
  size?: number;
  connectionId?: string;
}) {
  return request<{ code: number; message: string; data: API.MaterializationRunList }>(
    `${BASE}/materialization/runs`,
    { method: 'GET', params },
  );
}

export async function getMaterializedTableSchema(
  entityId: string,
  params: { connectionId: string },
) {
  return request<{ code: number; message: string; data: API.MaterializedTableSchema }>(
    `${BASE}/materialization/tables/${entityId}/schema`,
    { method: 'GET', params },
  );
}

export async function getMaterializedTableRows(
  entityId: string,
  params: { connectionId: string; page?: number; size?: number },
) {
  return request<{ code: number; message: string; data: API.MaterializedTableRowsResult }>(
    `${BASE}/materialization/tables/${entityId}/rows`,
    { method: 'GET', params },
  );
}

export async function postMaterializedMockData(
  entityId: string,
  body: { connectionId?: string; rows: Record<string, unknown>[]; rowCount?: number },
  params?: { connectionId?: string },
) {
  return request<{ code: number; message: string; data: API.MaterializedMockDataResult }>(
    `${BASE}/materialization/tables/${entityId}/mock-data`,
    { method: 'POST', params, data: body },
  );
}

export async function getDatabaseConnections() {
  return request<{ code: number; message: string; data: API.DatabaseConnection[] }>(
    `${BASE}/database-connections`,
    { method: 'GET' },
  );
}

export async function getDatabaseConnection(id: string) {
  return request<{ code: number; message: string; data: API.DatabaseConnection & { password?: string } }>(
    `${BASE}/database-connections/${id}`,
    { method: 'GET' },
  );
}

export async function postDatabaseConnection(body: Partial<API.DatabaseConnection> & { password?: string }) {
  return request<{ code: number; message: string; data: API.DatabaseConnection }>(
    `${BASE}/database-connections`,
    { method: 'POST', data: body },
  );
}

export async function putDatabaseConnection(
  id: string,
  body: Partial<API.DatabaseConnection> & { password?: string },
) {
  return request<{ code: number; message: string; data: API.DatabaseConnection }>(
    `${BASE}/database-connections/${id}`,
    { method: 'PUT', data: body },
  );
}

export async function deleteDatabaseConnection(id: string) {
  return request<{ code: number; message: string; data: null }>(
    `${BASE}/database-connections/${id}`,
    { method: 'DELETE' },
  );
}

export async function testDatabaseConnection(id: string) {
  return request<{ code: number; message: string; data: { success?: boolean; message?: string } }>(
    `${BASE}/database-connections/${id}/test`,
    { method: 'POST' },
  );
}

export async function getBizdataMetrics(params?: {
  codePrefix?: string;
  status?: string;
  page?: number;
  size?: number;
}) {
  return request<{ code: number; message: string; data: API.BizdataMetricList }>(`${BASE}/metrics`, {
    method: 'GET',
    params,
  });
}

export async function getBizdataMetric(id: string) {
  return request<{ code: number; message: string; data: API.BizdataMetric }>(`${BASE}/metrics/${id}`, {
    method: 'GET',
  });
}

export async function postBizdataMetric(body: Partial<API.BizdataMetric>) {
  return request<{ code: number; message: string; data: API.BizdataMetric }>(`${BASE}/metrics`, {
    method: 'POST',
    data: body,
  });
}

export async function patchBizdataMetric(id: string, body: Partial<API.BizdataMetric>) {
  return request<{ code: number; message: string; data: API.BizdataMetric }>(`${BASE}/metrics/${id}`, {
    method: 'PATCH',
    data: body,
  });
}

export async function deleteBizdataMetric(id: string) {
  return request<{ code: number; message: string; data: null }>(`${BASE}/metrics/${id}`, {
    method: 'DELETE',
  });
}

export async function postBizdataMetricExecute(id: string) {
  return request<{ code: number; message: string; data: Record<string, unknown> }>(
    `${BASE}/metrics/${id}/execute`,
    { method: 'POST' },
  );
}

export async function postBizdataMetricExecuteBatch(body?: { codePrefix?: string }) {
  return request<{ code: number; message: string; data: Record<string, unknown> }>(
    `${BASE}/metrics/execute-batch`,
    { method: 'POST', data: body || {} },
  );
}

export async function getBizdataMetricRuns(id: string, params?: { page?: number; size?: number }) {
  return request<{ code: number; message: string; data: { total?: number; items?: API.BizdataMetricRun[] } }>(
    `${BASE}/metrics/${id}/runs`,
    { method: 'GET', params },
  );
}

export async function getBizdataMetricValues(
  id: string,
  params?: { from?: string; to?: string; dimensionKey?: string; page?: number; size?: number },
) {
  return request<{ code: number; message: string; data: { total?: number; items?: API.BizdataMetricValue[] } }>(
    `${BASE}/metrics/${id}/values`,
    { method: 'GET', params },
  );
}

export async function getBizdataMetricValue(id: string, refresh?: boolean) {
  return request<{ code: number; message: string; data: Record<string, unknown> }>(
    `${BASE}/metrics/${id}/value`,
    { method: 'GET', params: refresh ? { refresh: '1' } : undefined },
  );
}

export async function getBizdataMetricsDashboard(params?: {
  codePrefix?: string;
  domainCode?: string;
  refresh?: boolean;
}) {
  return request<{ code: number; message: string; data: API.BizdataMetricDashboard }>(
    `${BASE}/metrics/dashboard`,
    {
      method: 'GET',
      params: params?.refresh ? { ...params, refresh: '1' } : params,
    },
  );
}

export async function getBizdataMetricCards(params?: {
  domainCode?: string;
  status?: string;
  page?: number;
  size?: number;
}) {
  return request<{ code: number; message: string; data: API.BizdataMetricCardList }>(
    `${BASE}/metrics/cards`,
    { method: 'GET', params },
  );
}

export async function getBizdataMetricCard(id: string) {
  return request<{ code: number; message: string; data: API.BizdataMetricCard }>(
    `${BASE}/metrics/cards/${id}`,
    { method: 'GET' },
  );
}

export async function postBizdataMetricCard(body: Partial<API.BizdataMetricCard> & { metricCode?: string }) {
  return request<{ code: number; message: string; data: API.BizdataMetricCard }>(`${BASE}/metrics/cards`, {
    method: 'POST',
    data: body,
  });
}

export async function patchBizdataMetricCard(
  id: string,
  body: Partial<API.BizdataMetricCard> & { metricCode?: string },
) {
  return request<{ code: number; message: string; data: API.BizdataMetricCard }>(
    `${BASE}/metrics/cards/${id}`,
    { method: 'PATCH', data: body },
  );
}

export async function deleteBizdataMetricCard(id: string) {
  return request<{ code: number; message: string; data: null }>(`${BASE}/metrics/cards/${id}`, {
    method: 'DELETE',
  });
}

export async function getBizdataMetricCardSuggest(params?: { metricId?: string; metricCode?: string }) {
  return request<{ code: number; message: string; data: Partial<API.BizdataMetricCard> & { hint?: string } }>(
    `${BASE}/metrics/cards/suggest`,
    { method: 'GET', params },
  );
}

export async function getBizdataDataStandards(params?: {
  keyword?: string;
  status?: string;
  page?: number;
  size?: number;
}) {
  return request<{ code: number; message: string; data: API.BizdataDataStandardList }>(
    `${BASE}/data-standards`,
    { method: 'GET', params },
  );
}

export async function getBizdataDataStandard(id: string) {
  return request<{ code: number; message: string; data: API.BizdataDataStandard }>(
    `${BASE}/data-standards/${id}`,
    { method: 'GET' },
  );
}

export async function postBizdataDataStandard(body: Partial<API.BizdataDataStandard>) {
  return request<{ code: number; message: string; data: API.BizdataDataStandard }>(
    `${BASE}/data-standards`,
    { method: 'POST', data: body },
  );
}

export async function putBizdataDataStandard(id: string, body: Partial<API.BizdataDataStandard>) {
  return request<{ code: number; message: string; data: API.BizdataDataStandard }>(
    `${BASE}/data-standards/${id}`,
    { method: 'PUT', data: body },
  );
}

export async function deleteBizdataDataStandard(id: string) {
  return request<{ code: number; message: string; data: null }>(`${BASE}/data-standards/${id}`, {
    method: 'DELETE',
  });
}

export async function getBizdataMetadataTables(params?: {
  keyword?: string;
  targetType?: string;
  page?: number;
  size?: number;
}) {
  return request<{ code: number; message: string; data: API.BizdataMetadataTableList }>(
    `${BASE}/metadata/tables`,
    { method: 'GET', params },
  );
}

export async function getBizdataMetadataTable(id: string) {
  return request<{ code: number; message: string; data: API.BizdataMetadataTable }>(
    `${BASE}/metadata/tables/${id}`,
    { method: 'GET' },
  );
}

export async function getBizdataMetadataByTarget(params: {
  targetType: string;
  targetId: string;
  fieldKey?: string;
}) {
  return request<{ code: number; message: string; data: API.BizdataMetadataByTarget }>(
    `${BASE}/metadata/by-target`,
    { method: 'GET', params },
  );
}

export async function postBizdataMetadataTable(body: Partial<API.BizdataMetadataTable>) {
  return request<{ code: number; message: string; data: API.BizdataMetadataTable }>(
    `${BASE}/metadata/tables`,
    { method: 'POST', data: body },
  );
}

export async function putBizdataMetadataTable(id: string, body: Partial<API.BizdataMetadataTable>) {
  return request<{ code: number; message: string; data: API.BizdataMetadataTable }>(
    `${BASE}/metadata/tables/${id}`,
    { method: 'PUT', data: body },
  );
}

export async function putBizdataMetadataTableFields(
  id: string,
  fields: API.BizdataMetadataField[],
) {
  return request<{ code: number; message: string; data: API.BizdataMetadataField[] }>(
    `${BASE}/metadata/tables/${id}/fields`,
    { method: 'PUT', data: { fields } },
  );
}

export async function postBizdataMetadataField(
  tableId: string,
  body: Partial<API.BizdataMetadataField>,
) {
  return request<{ code: number; message: string; data: API.BizdataMetadataField }>(
    `${BASE}/metadata/tables/${tableId}/fields`,
    { method: 'POST', data: body },
  );
}

export async function postBizdataMetadataSyncFromSchema() {
  return request<{ code: number; message: string; data: Record<string, number> }>(
    `${BASE}/metadata/sync-from-schema`,
    { method: 'POST' },
  );
}

const COLLECTION_PIPELINES_BASE = `${BASE}/collection-pipelines`;

export async function getCollectionPipelines(params?: {
  codePrefix?: string;
  status?: string;
  protocolType?: string;
  page?: number;
  size?: number;
}) {
  return request<{ code: number; message: string; data: API.CollectionPipelineList }>(
    COLLECTION_PIPELINES_BASE,
    { method: 'GET', params },
  );
}

export async function getCollectionPipeline(id: string) {
  return request<{ code: number; message: string; data: API.CollectionPipeline }>(
    `${COLLECTION_PIPELINES_BASE}/${id}`,
    { method: 'GET' },
  );
}

export async function postCollectionPipeline(body: Partial<API.CollectionPipeline> & {
  scopeCode?: string;
  pipelineSlug?: string;
}) {
  return request<{ code: number; message: string; data: API.CollectionPipeline }>(
    COLLECTION_PIPELINES_BASE,
    { method: 'POST', data: body },
  );
}

export async function patchCollectionPipeline(id: string, body: Partial<API.CollectionPipeline>) {
  return request<{ code: number; message: string; data: API.CollectionPipeline }>(
    `${COLLECTION_PIPELINES_BASE}/${id}`,
    { method: 'PATCH', data: body },
  );
}

export async function deleteCollectionPipeline(id: string) {
  return request<{ code: number; message: string; data: null }>(
    `${COLLECTION_PIPELINES_BASE}/${id}`,
    { method: 'DELETE' },
  );
}

export async function postCollectionPipelinePublish(id: string) {
  return request<{ code: number; message: string; data: API.CollectionPipeline }>(
    `${COLLECTION_PIPELINES_BASE}/${id}/publish`,
    { method: 'POST' },
  );
}

export async function postCollectionPipelineDisable(id: string) {
  return request<{ code: number; message: string; data: API.CollectionPipeline }>(
    `${COLLECTION_PIPELINES_BASE}/${id}/disable`,
    { method: 'POST' },
  );
}

export async function getCollectionPipelineTestProfile(id: string) {
  return request<{ code: number; message: string; data: API.CollectionPipelineTestProfile }>(
    `${COLLECTION_PIPELINES_BASE}/${id}/test-profile`,
    { method: 'GET' },
  );
}

export async function postCollectionPipelineTest(
  id: string,
  body?: { rawInput?: string; runType?: string },
) {
  return request<{ code: number; message: string; data: API.CollectionPipelineTestResult }>(
    `${COLLECTION_PIPELINES_BASE}/${id}/test`,
    { method: 'POST', data: body || {} },
  );
}

export async function getCollectionPipelineRuns(id: string, params?: { page?: number; size?: number }) {
  return request<{ code: number; message: string; data: API.CollectionPipelineRunList }>(
    `${COLLECTION_PIPELINES_BASE}/${id}/runs`,
    { method: 'GET', params },
  );
}
