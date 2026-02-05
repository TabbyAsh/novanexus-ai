import type { Policy, Scope, UserRole } from '@nova/shared';
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
export declare class PolicyEngine {
    private policies;
    constructor(policies?: Policy[]);
    /**
     * Load policies for an organization
     */
    loadPolicies(policies: Policy[]): void;
    /**
     * Add a single policy
     */
    addPolicy(policy: Policy): void;
    /**
     * Evaluate if an action is allowed
     */
    evaluate(context: PolicyContext): PolicyEvalResult;
    /**
     * Check if user has specific scope
     */
    hasScope(context: Omit<PolicyContext, 'resource'>, scope: Scope): boolean;
    /**
     * Get all allowed actions for a user
     */
    getAllowedActions(orgId: string, userRole: UserRole): Scope[];
    /**
     * Match action with wildcards
     */
    private matchAction;
    /**
     * Match resource with wildcards
     */
    private matchResource;
    /**
     * Match conditions against environment
     */
    private matchConditions;
    /**
     * Evaluate condition operators
     */
    private evaluateOperator;
}
/**
 * Create default policies for a new organization
 */
export declare function createDefaultPolicies(orgId: string): Policy[];
export default PolicyEngine;
