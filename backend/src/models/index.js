const sequelize = require('../config/database');

// 导入所有模型定义
const User = require('./user');
const Department = require('./department');
const Role = require('./role');
const Permission = require('./permission');
const UserRole = require('./user_role');
const DepartmentRole = require('./department_role');
const RolePermission = require('./role_permission');
const DataPermissionRule = require('./data_permission_rule');
const OperationLog = require('./operation_log');
const ThreeMemberApproval = require('./three_member_approval');
const RefreshToken = require('./refreshToken');
const DepartmentClosure = require('./department_closure');
const DepartmentHistory = require('./department_history');
const LoginAttempt = require('./loginAttempt');
const Captcha = require('./captcha');
const PasswordReset = require('./passwordReset');
const Application = require('./application');
const Provider = require('./provider');
const AiModel = require('./ai_model');
const ModelCapability = require('./model_capability');
const ModelIoTag = require('./model_io_tag');
const ApiRequestLog = require('./api_request_log');
const Scope = require('./scope');
const Tool = require('./tool');
const Skill = require('./skill');
const SkillTool = require('./skill_tool');
const SkillApplication = require('./skill_application');
const BizdataEntity = require('./bizdata_entity');
const BizdataEntityField = require('./bizdata_entity_field');
const BizdataEnum = require('./bizdata_enum');
const BizdataRelation = require('./bizdata_relation');
const BizdataMaterializationRun = require('./bizdata_materialization_run');
const BizdataMaterializationEntity = require('./bizdata_materialization_entity');
const BizdataDatabaseConnection = require('./bizdata_database_connection');
const BizdataSetting = require('./bizdata_setting');
const BizdataScopeDoc = require('./bizdata_scope_doc');
const BizdataApiService = require('./bizdata_api_service');
const BizdataApiServiceOperation = require('./bizdata_api_service_operation');
const BizdataApiServicePermission = require('./bizdata_api_service_permission');
const BizdataApiExceptionResponse = require('./bizdata_api_exception_response');
const BuiltinApiConfig = require('./builtin_api_config');
const OutboundWebhook = require('./outbound_webhook');
const OutboundWebhookRun = require('./outbound_webhook_run');
const AutomationHook = require('./automation_hook');
const AutomationHookRun = require('./automation_hook_run');
const BizdataMetric = require('./bizdata_metric');
const BizdataMetricRun = require('./bizdata_metric_run');
const BizdataMetricValue = require('./bizdata_metric_value');
const BizdataMetricCard = require('./bizdata_metric_card');
const BizdataDataStandard = require('./bizdata_data_standard');
const BizdataMetadataTable = require('./bizdata_metadata_table');
const BizdataMetadataField = require('./bizdata_metadata_field');
const BizdataCollectionPipeline = require('./bizdata_collection_pipeline');
const BizdataCollectionPipelineApplication = require('./bizdata_collection_pipeline_application');
const BizdataCollectionPipelineRun = require('./bizdata_collection_pipeline_run');
const StorageBucket = require('./storage_bucket');
const StorageObject = require('./storage_object');
const StorageUploadSession = require('./storage_upload_session');

// 设置模型关联关系
User.belongsTo(Department, { foreignKey: 'department_id' });
Department.hasMany(User, { foreignKey: 'department_id' });

User.belongsToMany(Role, { through: UserRole, foreignKey: 'user_id' });
Role.belongsToMany(User, { through: UserRole, foreignKey: 'role_id' });

Department.belongsToMany(Role, { through: DepartmentRole, foreignKey: 'department_id' });
Role.belongsToMany(Department, { through: DepartmentRole, foreignKey: 'role_id' });

Role.belongsToMany(Permission, { through: RolePermission, foreignKey: 'role_id' });
Permission.belongsToMany(Role, { through: RolePermission, foreignKey: 'permission_id' });

Role.hasMany(DataPermissionRule, { foreignKey: 'role_id' });
DataPermissionRule.belongsTo(Role, { foreignKey: 'role_id' });

User.hasMany(OperationLog, { foreignKey: 'user_id' });
OperationLog.belongsTo(User, { foreignKey: 'user_id' });

User.hasMany(RefreshToken, { foreignKey: 'user_id' });
RefreshToken.belongsTo(User, { foreignKey: 'user_id' });

Department.hasMany(DepartmentClosure, { foreignKey: 'ancestor_id', as: 'ancestors' });
Department.hasMany(DepartmentClosure, { foreignKey: 'descendant_id', as: 'descendants' });

User.hasMany(LoginAttempt, { foreignKey: 'user_id' });
LoginAttempt.belongsTo(User, { foreignKey: 'user_id' });

User.hasMany(PasswordReset, { foreignKey: 'user_id' });
PasswordReset.belongsTo(User, { foreignKey: 'user_id' });

Provider.hasMany(AiModel, { foreignKey: 'provider_id', as: 'models' });
AiModel.belongsTo(Provider, { foreignKey: 'provider_id', as: 'provider' });

AiModel.hasMany(ModelCapability, { foreignKey: 'model_id', as: 'capabilities' });
ModelCapability.belongsTo(AiModel, { foreignKey: 'model_id', as: 'model' });

AiModel.hasMany(ModelIoTag, { foreignKey: 'model_id', as: 'ioTags' });
ModelIoTag.belongsTo(AiModel, { foreignKey: 'model_id', as: 'model' });

Scope.hasMany(Tool, { foreignKey: 'scope_id', as: 'tools' });
Tool.belongsTo(Scope, { foreignKey: 'scope_id', as: 'scope' });

Scope.hasMany(Skill, { foreignKey: 'scope_id', as: 'skills' });
Skill.belongsTo(Scope, { foreignKey: 'scope_id', as: 'scope' });

Skill.belongsToMany(Tool, { through: SkillTool, foreignKey: 'skill_id', otherKey: 'tool_id', as: 'tools' });
Tool.belongsToMany(Skill, { through: SkillTool, foreignKey: 'tool_id', otherKey: 'skill_id', as: 'skills' });
SkillTool.belongsTo(Skill, { foreignKey: 'skill_id', as: 'skill' });
SkillTool.belongsTo(Tool, { foreignKey: 'tool_id', as: 'tool' });

Skill.belongsToMany(Application, {
  through: SkillApplication,
  foreignKey: 'skill_id',
  otherKey: 'application_id',
  as: 'applications',
});
Application.belongsToMany(Skill, {
  through: SkillApplication,
  foreignKey: 'application_id',
  otherKey: 'skill_id',
  as: 'skills',
});
SkillApplication.belongsTo(Skill, { foreignKey: 'skill_id', as: 'skill' });
SkillApplication.belongsTo(Application, { foreignKey: 'application_id', as: 'application' });

BizdataEntity.hasMany(BizdataEntityField, { foreignKey: 'entity_id', as: 'fields' });
BizdataEntityField.belongsTo(BizdataEntity, { foreignKey: 'entity_id', as: 'entity' });

BizdataEntity.hasMany(BizdataRelation, { foreignKey: 'from_entity_id', as: 'outgoingRelations' });
BizdataEntity.hasMany(BizdataRelation, { foreignKey: 'to_entity_id', as: 'incomingRelations' });
BizdataRelation.belongsTo(BizdataEntity, { foreignKey: 'from_entity_id', as: 'fromEntity' });
BizdataRelation.belongsTo(BizdataEntity, { foreignKey: 'to_entity_id', as: 'toEntity' });

BizdataMaterializationRun.hasMany(BizdataMaterializationEntity, { foreignKey: 'run_id', as: 'entities' });
BizdataMaterializationEntity.belongsTo(BizdataMaterializationRun, { foreignKey: 'run_id', as: 'run' });
BizdataMaterializationEntity.belongsTo(BizdataEntity, { foreignKey: 'entity_id', as: 'entity' });
BizdataEntity.hasMany(BizdataMaterializationEntity, { foreignKey: 'entity_id', as: 'materializations' });

BizdataMaterializationRun.belongsTo(BizdataDatabaseConnection, { foreignKey: 'connection_id', as: 'connection' });
BizdataDatabaseConnection.hasMany(BizdataMaterializationRun, { foreignKey: 'connection_id', as: 'runs' });

BizdataApiService.belongsTo(BizdataEntity, { foreignKey: 'entity_id', as: 'entity' });
BizdataEntity.hasMany(BizdataApiService, { foreignKey: 'entity_id', as: 'apiServices' });
BizdataApiService.belongsTo(BizdataDatabaseConnection, { foreignKey: 'connection_id', as: 'connection' });
BizdataDatabaseConnection.hasMany(BizdataApiService, { foreignKey: 'connection_id', as: 'apiServices' });
BizdataApiService.hasMany(BizdataApiServiceOperation, { foreignKey: 'api_service_id', as: 'operations' });
BizdataApiServiceOperation.belongsTo(BizdataApiService, { foreignKey: 'api_service_id', as: 'apiService' });
BizdataApiService.hasMany(BizdataApiServicePermission, { foreignKey: 'api_service_id', as: 'permissions' });
BizdataApiServicePermission.belongsTo(BizdataApiService, { foreignKey: 'api_service_id', as: 'apiService' });

BizdataMetric.belongsTo(BizdataDatabaseConnection, { foreignKey: 'connection_id', as: 'connection' });
BizdataDatabaseConnection.hasMany(BizdataMetric, { foreignKey: 'connection_id', as: 'metrics' });
BizdataMetric.hasMany(BizdataMetricRun, { foreignKey: 'metric_id', as: 'runs' });
BizdataMetricRun.belongsTo(BizdataMetric, { foreignKey: 'metric_id', as: 'metric' });
BizdataMetric.hasMany(BizdataMetricValue, { foreignKey: 'metric_id', as: 'values' });
BizdataMetricValue.belongsTo(BizdataMetric, { foreignKey: 'metric_id', as: 'metric' });
BizdataMetricRun.hasMany(BizdataMetricValue, { foreignKey: 'run_id', as: 'values' });
BizdataMetricValue.belongsTo(BizdataMetricRun, { foreignKey: 'run_id', as: 'run' });
BizdataMetric.hasMany(BizdataMetricCard, { foreignKey: 'metric_id', as: 'cards' });
BizdataMetricCard.belongsTo(BizdataMetric, { foreignKey: 'metric_id', as: 'metric' });

BizdataMetadataTable.belongsTo(BizdataDataStandard, { foreignKey: 'standard_id', as: 'standard' });
BizdataDataStandard.hasMany(BizdataMetadataTable, { foreignKey: 'standard_id', as: 'metadataTables' });
BizdataMetadataTable.hasMany(BizdataMetadataField, { foreignKey: 'metadata_table_id', as: 'fields' });
BizdataMetadataField.belongsTo(BizdataMetadataTable, { foreignKey: 'metadata_table_id', as: 'metadataTable' });
BizdataMetadataField.belongsTo(BizdataDataStandard, { foreignKey: 'standard_id', as: 'standard' });
BizdataDataStandard.hasMany(BizdataMetadataField, { foreignKey: 'standard_id', as: 'metadataFields' });

BizdataCollectionPipeline.belongsTo(BizdataEntity, { foreignKey: 'entity_id', as: 'entity' });
BizdataEntity.hasMany(BizdataCollectionPipeline, { foreignKey: 'entity_id', as: 'collectionPipelines' });
BizdataCollectionPipeline.belongsTo(BizdataDatabaseConnection, { foreignKey: 'connection_id', as: 'connection' });
BizdataDatabaseConnection.hasMany(BizdataCollectionPipeline, { foreignKey: 'connection_id', as: 'collectionPipelines' });
BizdataCollectionPipeline.hasMany(BizdataCollectionPipelineApplication, { foreignKey: 'pipeline_id', as: 'applications' });
BizdataCollectionPipelineApplication.belongsTo(BizdataCollectionPipeline, { foreignKey: 'pipeline_id', as: 'pipeline' });
BizdataCollectionPipeline.hasMany(BizdataCollectionPipelineRun, { foreignKey: 'pipeline_id', as: 'runs' });
BizdataCollectionPipelineRun.belongsTo(BizdataCollectionPipeline, { foreignKey: 'pipeline_id', as: 'pipeline' });

StorageBucket.belongsTo(Application, { foreignKey: 'application_id', as: 'Application' });
Application.hasMany(StorageBucket, { foreignKey: 'application_id', as: 'storageBuckets' });
StorageObject.belongsTo(StorageBucket, { foreignKey: 'bucket_id', as: 'StorageBucket' });
StorageBucket.hasMany(StorageObject, { foreignKey: 'bucket_id', as: 'objects' });
StorageObject.belongsTo(Application, { foreignKey: 'application_id', as: 'Application' });
StorageObject.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
StorageUploadSession.belongsTo(StorageBucket, { foreignKey: 'bucket_id', as: 'StorageBucket' });
StorageUploadSession.belongsTo(StorageObject, { foreignKey: 'object_id', as: 'StorageObject' });
StorageUploadSession.belongsTo(Application, { foreignKey: 'application_id', as: 'Application' });
StorageUploadSession.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

OutboundWebhook.hasMany(OutboundWebhookRun, { foreignKey: 'webhook_id', as: 'runs' });
OutboundWebhookRun.belongsTo(OutboundWebhook, { foreignKey: 'webhook_id', as: 'webhook' });

AutomationHook.hasMany(AutomationHookRun, { foreignKey: 'hook_id', as: 'runs' });
AutomationHookRun.belongsTo(AutomationHook, { foreignKey: 'hook_id', as: 'hook' });

module.exports = {
  sequelize,
  User,
  Department,
  Role,
  Permission,
  UserRole,
  DepartmentRole,
  RolePermission,
  DataPermissionRule,
  OperationLog,
  ThreeMemberApproval,
  RefreshToken,
  DepartmentClosure,
  DepartmentHistory,
  LoginAttempt,
  Captcha,
  PasswordReset,
  Application,
  Provider,
  AiModel,
  ModelCapability,
  ModelIoTag,
  ApiRequestLog,
  Scope,
  Tool,
  Skill,
  SkillTool,
  SkillApplication,
  BizdataEntity,
  BizdataEntityField,
  BizdataEnum,
  BizdataRelation,
  BizdataMaterializationRun,
  BizdataMaterializationEntity,
  BizdataDatabaseConnection,
  BizdataSetting,
  BizdataScopeDoc,
  BizdataApiService,
  BizdataApiServiceOperation,
  BizdataApiServicePermission,
  BizdataApiExceptionResponse,
  BuiltinApiConfig,
  BizdataMetric,
  BizdataMetricRun,
  BizdataMetricValue,
  BizdataMetricCard,
  BizdataDataStandard,
  BizdataMetadataTable,
  BizdataMetadataField,
  BizdataCollectionPipeline,
  BizdataCollectionPipelineApplication,
  BizdataCollectionPipelineRun,
  StorageBucket,
  StorageObject,
  StorageUploadSession,
  OutboundWebhook,
  OutboundWebhookRun,
  AutomationHook,
  AutomationHookRun,
}; 