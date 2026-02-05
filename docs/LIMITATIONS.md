# Nova Hub Limitations

## Phase 1 Limitations

### No Real External Connections
- All external services (exchanges, payment, social media) are **simulated**
- No actual API calls are made to external services
- This is by design for safety and offline operation

### Single-Node Only
- No distributed deployment support in Phase 1
- Single database instance
- Single worker process

### No Multi-Factor Authentication
- Username/password only
- MFA planned for Phase 2

### No Email Notifications
- All notifications are in-app only
- No email/SMS alerts

### English Only
- No internationalization (i18n)
- All UI and messages in English

### Desktop-First UI
- Not optimized for mobile devices
- Best experience on 1280px+ screens

### Single Timezone Per Org
- Each org has one timezone setting
- All daily budgets calculated in that timezone

### No Event Log Signing
- Events are hashed but not cryptographically signed
- No external proof of integrity (yet)

## Known Technical Limitations

### SQLite Mode
- Single-writer only (lock table)
- Not suitable for high-concurrency

### PostgreSQL Mode
- Requires Docker
- Advisory locks per org

### Backtest Accuracy
- Simplified indicator calculations
- No slippage modeling beyond random noise
- Not suitable for production trading decisions

### Content Generation
- Template-based only
- No AI/LLM integration (by design for determinism)

## What Nova Hub Does NOT Do

1. **Make investment decisions for you** - It provides tools, not advice
2. **Guarantee profits** - Past simulations don't predict future results
3. **Connect to real exchanges** - Phase 1 is paper trading only
4. **Process real payments** - All orders are simulated
5. **Post to real social media** - All posting is simulated

## Future Phases

### Phase 2 (Planned)
- OIDC authentication
- Real connector framework
- Multi-tenant SaaS mode
- Email notifications

### Phase 3 (Future)
- Distributed workers
- Hardware integrations
- Cross-org collaboration
