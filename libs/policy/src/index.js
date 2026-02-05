"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PolicyEngine = void 0;
exports.createDefaultPolicies = createDefaultPolicies;
/**
 * Policy Engine - evaluates permissions based on configured policies
 */
class PolicyEngine {
    policies = [];
    constructor(policies = []) {
        this.policies = policies;
    }
    /**
     * Load policies for an organization
     */
    loadPolicies(policies) {
        this.policies = policies;
    }
    /**
     * Add a single policy
     */
    addPolicy(policy) {
        this.policies.push(policy);
    }
    /**
     * Evaluate if an action is allowed
     */
    evaluate(context) {
        // Filter policies for this org and role
        const applicablePolicies = this.policies.filter((p) => p.orgId === context.orgId &&
            (p.subjectRole === context.userRole || p.subjectRole === 'OWNER'));
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
    hasScope(context, scope) {
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
    getAllowedActions(orgId, userRole) {
        const allowedActions = new Set();
        const policies = this.policies.filter((p) => p.orgId === orgId && p.subjectRole === userRole && p.effect === 'ALLOW');
        for (const policy of policies) {
            allowedActions.add(policy.action);
        }
        return Array.from(allowedActions);
    }
    /**
     * Match action with wildcards
     */
    matchAction(policyAction, requestedAction) {
        if (policyAction === requestedAction)
            return true;
        // Handle wildcards (e.g., trade.* matches trade.read)
        const policyParts = policyAction.split('.');
        const requestedParts = requestedAction.split('.');
        for (let i = 0; i < policyParts.length; i++) {
            if (policyParts[i] === '*')
                return true;
            if (policyParts[i] !== requestedParts[i])
                return false;
        }
        return policyParts.length === requestedParts.length;
    }
    /**
     * Match resource with wildcards
     */
    matchResource(policyResource, requestedResource) {
        if (policyResource === '*')
            return true;
        if (policyResource === requestedResource)
            return true;
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
    matchConditions(conditions, environment) {
        if (!conditions || Object.keys(conditions).length === 0)
            return true;
        if (!environment)
            return false;
        for (const [key, expectedValue] of Object.entries(conditions)) {
            const actualValue = environment[key];
            if (typeof expectedValue === 'object' && expectedValue !== null) {
                // Handle operators like { $gt: 10 }, { $in: ['a', 'b'] }
                for (const [op, opValue] of Object.entries(expectedValue)) {
                    if (!this.evaluateOperator(op, actualValue, opValue)) {
                        return false;
                    }
                }
            }
            else if (actualValue !== expectedValue) {
                return false;
            }
        }
        return true;
    }
    /**
     * Evaluate condition operators
     */
    evaluateOperator(op, actual, expected) {
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
exports.PolicyEngine = PolicyEngine;
/**
 * Create default policies for a new organization
 */
function createDefaultPolicies(orgId) {
    const generateId = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
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
            action: 'admin.users',
            resource: '*',
            effect: 'ALLOW',
        },
        {
            id: generateId(),
            orgId,
            subjectRole: 'OWNER',
            action: 'admin.billing',
            resource: '*',
            effect: 'ALLOW',
        },
        {
            id: generateId(),
            orgId,
            subjectRole: 'OWNER',
            action: 'admin.killswitch',
            resource: '*',
            effect: 'ALLOW',
        },
        {
            id: generateId(),
            orgId,
            subjectRole: 'OWNER',
            action: 'admin.audit',
            resource: '*',
            effect: 'ALLOW',
        },
        // Default read permissions for members
        {
            id: generateId(),
            orgId,
            subjectRole: 'MEMBER',
            action: 'trade.read',
            resource: '*',
            effect: 'ALLOW',
        },
        {
            id: generateId(),
            orgId,
            subjectRole: 'MEMBER',
            action: 'store.read',
            resource: '*',
            effect: 'ALLOW',
        },
        {
            id: generateId(),
            orgId,
            subjectRole: 'MEMBER',
            action: 'social.read',
            resource: '*',
            effect: 'ALLOW',
        },
        {
            id: generateId(),
            orgId,
            subjectRole: 'MEMBER',
            action: 'research.read',
            resource: '*',
            effect: 'ALLOW',
        },
    ];
}
exports.default = PolicyEngine;
