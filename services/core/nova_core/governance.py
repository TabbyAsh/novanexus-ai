"""
Governance system: policies, approvals, ARM toggle, kill switch.

Defense in depth for real actions:
1. Environment: NOVA_ALLOW_REAL_ACTIONS=true
2. Policy: no_real_money=false + specific permission
3. Approval: Valid, unexpired approval record
4. ARM: Toggle armed with unexpired timestamp

Kill switch: Global flag that immediately blocks AUTOMATE mode.
"""
import os
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from datetime import datetime, timezone
from decimal import Decimal


class GovernanceMode(str, Enum):
    """Automation modes."""
    RECOMMEND = "recommend"  # Bot suggests, user decides
    ASSIST = "assist"        # Bot prepares, user confirms each
    AUTOMATE = "automate"    # Bot executes within policy


class ActionType(str, Enum):
    """Types of actions that may require approval."""
    LIVE_TRADE = "live_trade"
    REAL_PURCHASE = "real_purchase"
    REAL_POST = "real_post"
    CONNECTOR_USE = "connector_use"


class PolicyConfig(BaseModel):
    """
    Organization policy configuration.
    
    Defaults are safe: no real money, no automation.
    """
    no_real_money: bool = Field(default=True, description="Block all real financial transactions")
    automation_allowed: bool = Field(default=False, description="Allow AUTOMATE mode")
    max_daily_loss: str = Field(default="100.00", description="Max daily loss limit (decimal string)")
    max_position_size: str = Field(default="1000.00", description="Max position size (decimal string)")
    max_orders_per_day: int = Field(default=10, description="Max orders per day")
    max_spend_per_day: str = Field(default="500.00", description="Max daily spend (decimal string)")
    require_approval_for: List[str] = Field(
        default_factory=lambda: ["live_trade", "real_purchase", "real_post"],
        description="Actions requiring explicit approval"
    )
    allow_connectors: bool = Field(default=False, description="Allow external connectors")
    allowed_symbols: List[str] = Field(default_factory=list, description="Allowed trading symbols")
    blocked_symbols: List[str] = Field(default_factory=list, description="Blocked trading symbols")
    content_safety_mode: str = Field(default="strict", description="Content safety level: strict/moderate/relaxed")
    
    def to_dict(self) -> Dict[str, Any]:
        return self.model_dump()
    
    @classmethod
    def default_safe(cls) -> "PolicyConfig":
        """Return the safest default policy."""
        return cls()


class Approval(BaseModel):
    """
    Approval record for specific actions.
    
    Approvals are versioned via events and have explicit expiry.
    """
    id: str
    org_id: str
    approver_id: str
    scope: str  # e.g., "live_trade", "live_trade:BTCUSD"
    expires_at: str  # ISO8601
    created_at: str  # ISO8601
    revoked: bool = False
    revoked_at: Optional[str] = None
    
    def is_valid(self, clock) -> bool:
        """Check if approval is currently valid."""
        if self.revoked:
            return False
        expires = datetime.fromisoformat(self.expires_at.replace('Z', '+00:00'))
        return clock.now_utc() < expires


class ArmState(BaseModel):
    """
    ARM toggle state.
    
    ARM must be explicitly enabled (with expiry) for real actions.
    This provides an additional time-limited gate beyond approval.
    """
    armed: bool = False
    armed_at: Optional[str] = None
    armed_by: Optional[str] = None
    expires_at: Optional[str] = None
    
    def is_armed(self, clock) -> bool:
        """Check if ARM is currently active."""
        if not self.armed or not self.expires_at:
            return False
        expires = datetime.fromisoformat(self.expires_at.replace('Z', '+00:00'))
        return clock.now_utc() < expires


class KillSwitchState(BaseModel):
    """
    Global kill switch state.
    
    When activated, ALL AUTOMATE mode tasks are blocked immediately.
    """
    active: bool = False
    activated_at: Optional[str] = None
    activated_by: Optional[str] = None
    reason: Optional[str] = None


class GovernanceState(BaseModel):
    """Combined governance state for an organization."""
    policy: PolicyConfig = Field(default_factory=PolicyConfig.default_safe)
    kill_switch: KillSwitchState = Field(default_factory=KillSwitchState)
    arm_state: ArmState = Field(default_factory=ArmState)
    approvals: List[Approval] = Field(default_factory=list)


class DenialReason(str, Enum):
    """Reasons for action denial."""
    ENV_BLOCKED = "env_blocked"
    KILL_SWITCH = "kill_switch"
    POLICY_NO_REAL_MONEY = "policy_no_real_money"
    POLICY_NO_AUTOMATION = "policy_no_automation"
    NO_APPROVAL = "no_approval"
    ARM_NOT_ENABLED = "arm_not_enabled"
    BUDGET_EXCEEDED = "budget_exceeded"
    SYMBOL_BLOCKED = "symbol_blocked"


class GovernanceCheckResult(BaseModel):
    """Result of a governance check."""
    allowed: bool
    denial_reason: Optional[DenialReason] = None
    denial_details: Optional[str] = None


class GovernanceChecker:
    """
    Checks governance gates for actions.
    
    All four gates must pass for real actions:
    1. Environment
    2. Policy
    3. Approval
    4. ARM
    """
    
    def __init__(self, clock, state: GovernanceState):
        self.clock = clock
        self.state = state
    
    def _env_allows_real_actions(self) -> bool:
        """Check environment gate."""
        return os.environ.get("NOVA_ALLOW_REAL_ACTIONS", "false").lower() == "true"
    
    def check_automation_allowed(self, mode: GovernanceMode) -> GovernanceCheckResult:
        """Check if automation mode is allowed."""
        if mode == GovernanceMode.AUTOMATE:
            if self.state.kill_switch.active:
                return GovernanceCheckResult(
                    allowed=False,
                    denial_reason=DenialReason.KILL_SWITCH,
                    denial_details="Kill switch is active"
                )
            if not self.state.policy.automation_allowed:
                return GovernanceCheckResult(
                    allowed=False,
                    denial_reason=DenialReason.POLICY_NO_AUTOMATION,
                    denial_details="Automation not allowed by policy"
                )
        return GovernanceCheckResult(allowed=True)
    
    def check_real_action(
        self,
        action_type: ActionType,
        scope: Optional[str] = None
    ) -> GovernanceCheckResult:
        """
        Full governance check for real actions.
        
        Checks all four gates in order:
        1. Environment
        2. Policy
        3. Approval
        4. ARM
        """
        # Gate 1: Environment
        if not self._env_allows_real_actions():
            return GovernanceCheckResult(
                allowed=False,
                denial_reason=DenialReason.ENV_BLOCKED,
                denial_details="NOVA_ALLOW_REAL_ACTIONS is not enabled"
            )
        
        # Gate 2: Kill switch
        if self.state.kill_switch.active:
            return GovernanceCheckResult(
                allowed=False,
                denial_reason=DenialReason.KILL_SWITCH,
                denial_details="Kill switch is active"
            )
        
        # Gate 3: Policy
        if self.state.policy.no_real_money:
            return GovernanceCheckResult(
                allowed=False,
                denial_reason=DenialReason.POLICY_NO_REAL_MONEY,
                denial_details="Policy blocks real money transactions"
            )
        
        # Gate 4: Approval required?
        action_str = action_type.value
        if action_str in self.state.policy.require_approval_for:
            # Check for valid approval
            approval_scope = f"{action_str}:{scope}" if scope else action_str
            has_approval = any(
                a.is_valid(self.clock) and 
                (a.scope == approval_scope or a.scope == action_str)
                for a in self.state.approvals
            )
            if not has_approval:
                return GovernanceCheckResult(
                    allowed=False,
                    denial_reason=DenialReason.NO_APPROVAL,
                    denial_details=f"No valid approval for {approval_scope}"
                )
        
        # Gate 5: ARM
        if not self.state.arm_state.is_armed(self.clock):
            return GovernanceCheckResult(
                allowed=False,
                denial_reason=DenialReason.ARM_NOT_ENABLED,
                denial_details="ARM toggle is not enabled"
            )
        
        return GovernanceCheckResult(allowed=True)
    
    def check_symbol(self, symbol: str) -> GovernanceCheckResult:
        """Check if a trading symbol is allowed."""
        if symbol in self.state.policy.blocked_symbols:
            return GovernanceCheckResult(
                allowed=False,
                denial_reason=DenialReason.SYMBOL_BLOCKED,
                denial_details=f"Symbol {symbol} is blocked"
            )
        if self.state.policy.allowed_symbols:
            if symbol not in self.state.policy.allowed_symbols:
                return GovernanceCheckResult(
                    allowed=False,
                    denial_reason=DenialReason.SYMBOL_BLOCKED,
                    denial_details=f"Symbol {symbol} is not in allowed list"
                )
        return GovernanceCheckResult(allowed=True)
    
    def check_daily_budget(
        self,
        current_spend: Decimal,
        proposed_amount: Decimal
    ) -> GovernanceCheckResult:
        """Check if proposed amount would exceed daily budget."""
        max_spend = Decimal(self.state.policy.max_spend_per_day)
        if current_spend + proposed_amount > max_spend:
            return GovernanceCheckResult(
                allowed=False,
                denial_reason=DenialReason.BUDGET_EXCEEDED,
                denial_details=f"Would exceed daily budget of {max_spend}"
            )
        return GovernanceCheckResult(allowed=True)
