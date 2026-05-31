/**
 * VLH — Value Loop Hub Intelligence Layer
 * ========================================
 * DB-backed services for the Value Loop Hub architecture.
 * All classes use dependency injection via VLHPersistenceAdapter.
 *
 * Usage in nova-hub:
 *
 *   import { query, queryOne, transaction } from '@nova/shared';
 *   import {
 *     createSharedDbAdapter,
 *     GovernanceEngine,
 *     LearningEngine,
 *     ActionPlanBuilder,
 *   } from '@nova/nexus-core/vlh';
 *
 *   const vlhDb = createSharedDbAdapter({ query, queryOne, transaction });
 *   const governance = new GovernanceEngine(vlhDb);
 *   const learning = new LearningEngine(vlhDb);
 *   const actionPlanBuilder = new ActionPlanBuilder(vlhDb);
 */

export {
  GovernanceEngine,
  type GovernanceCheckInput,
  type GovernanceCheckOutput,
  type GovernanceEntityType,
  type GovernanceResultValue,
  type EnforcementModeValue,
  type PolicyDefinition,
  type PolicyRuleSet,
  type PolicyCheckResult,
} from './governance';

export {
  LearningEngine,
  ActionPlanBuilder,
  type LearningOutcomeInput,
  type LearningResult,
  type CalibrationProfile,
  type ActionPlanInput,
  type ActionStepInput,
} from './learning';

export {
  createSharedDbAdapter,
  type VLHPersistenceAdapter,
  type TransactionClient,
  type QueryResult,
} from './persistence';
