# Nova Hub - Threat Model

**Version:** 1.0
**Date:** 2026-01-20
**Status:** Draft

## 1. System Overview

Nova Hub is a multi-service platform handling:
- User authentication and authorization
- Financial data (paper trading, billing)
- Event sourcing with audit trail
- Bot automation systems

## 2. Trust Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│                    EXTERNAL (Untrusted)                      │
│  • End Users (browsers, mobile apps)                         │
│  • External APIs (market data, social platforms)             │
│  • Webhooks (Stripe, etc.)                                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    GATEWAY (DMZ)                             │
│  • API Gateway (port 3000)                                   │
│  • Rate limiting                                             │
│  • Input validation                                          │
│  • Authentication verification                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    INTERNAL SERVICES                         │
│  • Auth Service (JWT, RBAC)                                  │
│  • Orchestrator (goal/task management)                       │
│  • Bot Services (trade, store, social, etc.)                │
│  • Event Bus (event sourcing)                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    DATA LAYER                                │
│  • PostgreSQL (persistent data)                              │
│  • Redis (sessions, cache)                                   │
│  • MinIO (file storage)                                      │
└─────────────────────────────────────────────────────────────┘
```

## 3. Assets

### High Value Assets
| Asset | Sensitivity | Impact if Compromised |
|-------|-------------|----------------------|
| User credentials | Critical | Account takeover, data breach |
| JWT secrets | Critical | All user impersonation |
| Financial data | High | PII exposure, fraud |
| Event audit log | High | Compliance violation, evidence tampering |
| API keys (Stripe, etc.) | High | Financial fraud |

### Medium Value Assets
| Asset | Sensitivity | Impact if Compromised |
|-------|-------------|----------------------|
| Trading strategies | Medium | Competitive advantage loss |
| Content drafts | Medium | Reputational damage |
| User preferences | Medium | Privacy violation |

## 4. Threat Actors

| Actor | Motivation | Capability |
|-------|------------|------------|
| External Attackers | Financial gain, data theft | Medium-High |
| Malicious Users | Abuse platform, fraud | Low-Medium |
| Compromised Bot | Execute unauthorized actions | Medium |
| Insider (if applicable) | Various | High |

## 5. STRIDE Analysis

### Spoofing
| Threat | Mitigation | Status |
|--------|------------|--------|
| Credential stuffing | Rate limiting (10/min), account lockout | ✅ Implemented |
| JWT token theft | Short expiry (1h), refresh tokens | ✅ Implemented |
| Session hijacking | Secure cookies, Redis session store | 🔄 Partial |

### Tampering
| Threat | Mitigation | Status |
|--------|------------|--------|
| Event log modification | Hash chain (prev_hash → hash), append-only | ✅ Implemented |
| Request modification | HTTPS (production), input validation | ✅ Implemented |
| Database tampering | No UPDATE on events table, audit triggers | ✅ Implemented |

### Repudiation
| Threat | Mitigation | Status |
|--------|------------|--------|
| Action denial | Event sourcing with actor_id, correlation_id | ✅ Implemented |
| Audit log gaps | Hash chain integrity check | ✅ Implemented |
| Timestamp manipulation | Server-side timestamps only | ✅ Implemented |

### Information Disclosure
| Threat | Mitigation | Status |
|--------|------------|--------|
| Credential exposure | bcrypt hashing (12 rounds), never log passwords | ✅ Implemented |
| API key leakage | Environment variables, .env.example pattern | ✅ Implemented |
| Error message leakage | Generic error messages externally | 🔄 Partial |
| Log exposure | Structured logging, no PII in logs | ⏳ Planned |

### Denial of Service
| Threat | Mitigation | Status |
|--------|------------|--------|
| API flooding | Rate limiting at gateway | ⏳ Planned |
| Resource exhaustion | Query pagination, timeouts | 🔄 Partial |
| Bot runaway | Kill switch, task rate limits | ✅ Implemented |

### Elevation of Privilege
| Threat | Mitigation | Status |
|--------|------------|--------|
| Role escalation | RBAC with explicit policies | ✅ Implemented |
| Scope expansion | JWT contains scopes, verified per request | ✅ Implemented |
| Bot privilege abuse | Policy engine check before execution | ✅ Implemented |

## 6. Critical Security Controls

### Must Have (P0)
- [x] Password hashing (bcrypt, 12 rounds)
- [x] JWT authentication with short expiry
- [x] RBAC with policy engine
- [x] Immutable audit log with hash chain
- [x] Kill switch for automation
- [ ] HTTPS in production
- [ ] Input validation on all endpoints
- [ ] Rate limiting

### Should Have (P1)
- [ ] CSRF protection
- [ ] CSP headers
- [ ] Dependency vulnerability scanning
- [ ] Secrets rotation procedure
- [ ] Backup encryption

### Nice to Have (P2)
- [ ] MFA support
- [ ] IP allowlisting
- [ ] Anomaly detection
- [ ] WAF integration

## 7. Security Testing Requirements

### Before MVP Launch
1. Verify all auth endpoints reject invalid input
2. Test RBAC enforcement across all protected routes
3. Verify event chain integrity after operations
4. Test rate limiting effectiveness
5. Verify no secrets in logs or error messages

### Ongoing
- Dependency audit (monthly)
- Penetration testing (quarterly)
- Security review for new features

## 8. Incident Response

### Kill Switch Activation
```sql
-- Disable all automation immediately
UPDATE system_state SET value_json = '{"enabled": true}' WHERE key = 'kill_switch';
```

### Credential Compromise
1. Activate kill switch
2. Rotate JWT_SECRET (invalidates all sessions)
3. Force password reset for affected users
4. Audit event log for unauthorized actions

### Data Breach
1. Activate kill switch
2. Preserve evidence (do not modify/delete)
3. Identify scope of breach via event log
4. Notify affected users per compliance requirements

## 9. Compliance Notes

- **Financial Data:** Paper trading only until proper compliance review
- **User Data:** Minimize PII collection, provide deletion capability
- **Audit Trail:** Maintain 365 days minimum per policy
- **Trading Disclaimers:** Required on all trading-related features

## 10. Review Schedule

- **Monthly:** Dependency updates, access review
- **Quarterly:** Full threat model review
- **Per Release:** Security review of changes

---

**Next Review:** 2026-02-20
**Owner:** Security Lead
