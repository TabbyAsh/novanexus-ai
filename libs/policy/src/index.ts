import type { Policy, Scope, UserRole, PolicyEffect } from '@nova/shared';

/**
 * Policy evaluation result
 */
export interface PolicyEvalResult {
  allowed: boolean;
  matchedPolicy?: Policy;
  reason: string;
}

/**
 * Context for policy evaluation
 */
export interface PolicyContext {
  orgId: string;
  userId: string;
  userRole: UserRole;
  action: Scope;
  resource: string;
  environment?: Record<string, unknown>;
}

/**
 * Policy Engine - evaluates permissions based on configured policies
 */
export class PolicyEngine {
  private policies: Policy[] = [];

  constructor(policies: Policy[] = []) {
    this.policies = policies;
  }

  /**
   * Load policies for an organization
   */
  loadPolicies(policies: Policy[]): void {
    this.policies = policies;
  }

  /**
   * Add a single policy
   */
  addPolicy(policy: Policy): void {
    this.policies.push(policy);
  }

  /**
   * Evaluate if an action is allowed
   */
  evaluate(context: PolicyContext): PolicyEvalResult {
    // Filter policies for this org and role
    const applicablePolicies = this.policies.filter(
      (p) =>
        p.orgId === context.orgId &&
        (p.subjectRole === context.userRole || p.subjectRole === 'OWNER')
    );

    // Find matching policies for the action and resource
    const matchingPolicies = applicablePolicies.filter((p) => {
      const actionMatch = this.matchAction(p.action, context.action);
      const resourceMatch = this.matchResource(p.resource, context.resource);
      const conditionsMatch = this.matchConditions(p.conditions, context.environment);
      return actionMatch && resourceMatch && conditionsMatch;
    });

    if (matchingPolicies.length === 0) {
      return {
        allowed: false,
        reason: 'No matching policy found',
      };
    }

    // Deny takes precedence
    const denyPolicy = matchingPolicies.find((p) => p.effect === 'DENY');
    if (denyPolicy) {
      return {
        allowed: false,
        matchedPolicy: denyPolicy,
        reason: 'Explicitly denied by policy',
      };
    }

    // Check for allow
    const allowPolicy = matchingPolicies.find((p) => p.effect === 'ALLOW');
    if (allowPolicy) {
      return {
        allowed: true,
        matchedPolicy: allowPolicy,
        reason: 'Allowed by policy',
      };
    }

    return {
      allowed: false,
      reason: 'No allowing policy found',
    };
  }

  /**
   * Check if user has specific scope
   */
  hasScope(context: Omit<PolicyContext, 'resource'>, scope: Scope): boolean {
    const result = this.evaluate({
      ...context,
      action: scope,
      resource: '*',
    });
    return result.allowed;
  }

  /**
   * Get all allowed actions for a user
   */
  getAllowedActions(orgId: string, userRole: UserRole): Scope[] {
    const allowedActions = new Set<Scope>();
    
    const policies = this.policies.filter(
      (p) => p.orgId === orgId && p.subjectRole === userRole && p.effect === 'ALLOW'
    );

    for (const policy of policies) {
      allowedActions.add(policy.action);
    }

    return Array.from(allowedActions);
  }

  /**
   * Match action with wildcards
   */
  private matchAction(policyAction: Scope, requestedAction: Scope): boolean {
    if (policyAction === requestedAction) return true;
    
    // Handle wildcards (e.g., trade.* matches trade.read)
    const policyParts = policyAction.split('.');
    const requestedParts = requestedAction.split('.');
    
    for (let i = 0; i < policyParts.length; i++) {
      if (policyParts[i] === '*') return true;
      if (policyParts[i] !== requestedParts[i]) return false;
    }
    
    return policyParts.length === requestedParts.length;
  }

  /**
   * Match resource with wildcards
   */
  private matchResource(policyResource: string, requestedResource: string): boolean {
    if (policyResource === '*') return true;
    if (policyResource === requestedResource) return true;
    
    // Handle path-based wildcards (e.g., /orgs/123/* matches /orgs/123/trades)
    if (policyResource.endsWith('/*')) {
      const prefix = policyResource.slice(0, -1);
      return requestedResource.startsWith(prefix);
    }
    
    return false;
  }

  /**
   * Match conditions against environment
   */
  private matchConditions(
    conditions: Record<string, unknown> | undefined,
    environment: Record<string, unknown> | undefined
  ): boolean {
    if (!conditions || Object.keys(conditions).length === 0) return true;
    if (!environment) return false;

    for (const [key, expectedValue] of Object.entries(conditions)) {
      const actualValue = environment[key];
      
      if (typeof expectedValue === 'object' && expectedValue !== null) {
        // Handle operators like { $gt: 10 }, { $in: ['a', 'b'] }
        for (const [op, opValue] of Object.entries(expectedValue as Record<string, unknown>)) {
          if (!this.evaluateOperator(op, actualValue, opValue)) {
            return false;
          }
        }
      } else if (actualValue !== expectedValue) {
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluate condition operators
   */
  private evaluateOperator(op: string, actual: unknown, expected: unknown): boolean {
    switch (op) {
      case '$eq':
        return actual === expected;
      case '$ne':
        return actual !== expected;
      case '$gt':
        return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
      case '$gte':
        return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
      case '$lt':
        return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
      case '$lte':
        return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
      case '$in':
        return Array.isArray(expected) && expected.includes(actual);
      case '$nin':
        return Array.isArray(expected) && !expected.includes(actual);
      default:
        return false;
    }
  }
}

/**
 * Create default policies for a new organization
 */
export function createDefaultPolicies(orgId: string): Policy[] {
  const generateId = () =>
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });

  return [
    // Owner has all permissions
    {
      id: generateId(),
      orgId,
      subjectRole: 'OWNER',
      action: 'admin.users' as Scope,
      resource: '*',
      effect: 'ALLOW' as PolicyEffect,
    },
    {
      id: generateId(),
      orgId,
      subjectRole: 'OWNER',
      action: 'admin.billing' as Scope,
      resource: '*',
      effect: 'ALLOW' as PolicyEffect,
    },
    {
      id: generateId(),
      orgId,
      subjectRole: 'OWNER',
      action: 'admin.killswitch' as Scope,
      resource: '*',
      effect: 'ALLOW' as PolicyEffect,
    },
    {
      id: generateId(),
      orgId,
      subjectRole: 'OWNER',
      action: 'admin.audit' as Scope,
      resource: '*',
      effect: 'ALLOW' as PolicyEffect,
    },
    // Default read permissions for members
    {
      id: generateId(),
      orgId,
      subjectRole: 'MEMBER',
      action: 'trade.read' as Scope,
      resource: '*',
      effect: 'ALLOW' as PolicyEffect,
    },
    {
      id: generateId(),
      orgId,
      subjectRole: 'MEMBER',
      action: 'store.read' as Scope,
      resource: '*',
      effect: 'ALLOW' as PolicyEffect,
    },
    {
      id: generateId(),
      orgId,
      subjectRole: 'MEMBER',
      action: 'social.read' as Scope,
      resource: '*',
      effect: 'ALLOW' as PolicyEffect,
    },
    {
      id: generateId(),
      orgId,
      subjectRole: 'MEMBER',
      action: 'research.read' as Scope,
      resource: '*',
      effect: 'ALLOW' as PolicyEffect,
    },
  ];
}

export default PolicyEngine;
