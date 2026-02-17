# Comprehensive Treasury Management System

## Overview

This document describes the comprehensive treasury management system that transforms ChainCola's treasury from a visibility dashboard into a resilient, self-healing financial control system suitable for scale, regulatory scrutiny, and institutional trust.

## Migration File

**File:** `20260202000003_comprehensive_treasury_management_system.sql`

This migration implements all 9 major feature categories with complete database schema, functions, and controls.

---

## 1. Wallet Management (Missing Controls)

### Features Implemented

#### Wallet Type Classification
- **Table:** `wallet_types`
- **Types:** Hot (security level 1), Warm (security level 5), Cold (security level 10)
- **Purpose:** Classify wallets by security level and operational risk

#### Wallet Registry
- **Table:** `wallet_registry`
- **Features:**
  - Wallet name, address, and asset tracking
  - Environment tagging: DEV, STAGING, PRODUCTION
  - Wallet type association (Hot/Warm/Cold)
  - On-chain balance polling schedule (configurable per wallet)
  - Wallet rotation and deprecation tracking
  - Wallet-level withdrawal limits:
    - Daily withdrawal limit
    - Weekly withdrawal limit
    - Monthly withdrawal limit
    - Single transaction limit
  - Active/deprecated status tracking
  - Rotation schedule tracking

### Use Cases
- Track all system wallets in one registry
- Enforce withdrawal limits per wallet
- Schedule automatic wallet rotation
- Monitor wallet health and deprecation

---

## 2. Inventory Management (Critical Gaps)

### Features Implemented

#### Auto-Expiry of Unconfirmed Entries
- **Function:** `expire_unconfirmed_inventory()`
- **Behavior:**
  - Automatically expires pending inventory adjustments after expiry time
  - Reverses pending balances when entries expire
  - Marks entries as `REVERSED` with auto-expiry reason
  - Prevents stale pending entries from affecting liquidity calculations

#### Enhanced Metadata Tracking
- **Fields Added:**
  - `expires_at`: Timestamp when pending entry expires
  - `auto_expired`: Boolean flag for auto-expired entries
  - `expired_at`: Timestamp when entry was expired

#### Indexes
- Index on pending adjustments with expiry dates for efficient cleanup

### Use Cases
- Prevent pending deposits from staying pending indefinitely
- Automatically clean up unconfirmed inventory entries
- Maintain accurate pending balance calculations

---

## 3. Ledger vs On-Chain Reconciliation

### Features Implemented

#### Tolerance Thresholds
- **Fields Added to `treasury_reconciliation_status`:**
  - `tolerance_threshold`: Absolute tolerance (default: 0.0001)
  - `tolerance_percentage`: Percentage tolerance (default: 0.01%)
  - `auto_resolve_enabled`: Enable/disable auto-resolution
  - `last_auto_resolved_at`: Timestamp of last auto-resolution

#### Auto-Resolution Rules
- **Logic:**
  - Small discrepancies within tolerance are auto-resolved
  - Medium discrepancies (10x tolerance) can be auto-resolved if enabled
  - Large discrepancies (>100x tolerance) require admin approval

#### Enhanced Force Reconciliation
- **Function:** `force_reconciliation()` (enhanced)
- **Parameters:**
  - `p_auto_resolve`: Enable auto-resolution for small discrepancies
  - Tolerance-based status determination
  - Automatic approval workflow for small discrepancies

### Use Cases
- Automatically resolve small rounding differences
- Require approval for significant discrepancies
- Reduce manual intervention for minor reconciliation issues

---

## 4. Reconciliation Workflow Engine

### Features Implemented

#### Reconciliation Runs Table
- **Table:** `reconciliation_runs`
- **Lifecycle States:**
  - `OPEN`: Initial state, awaiting investigation
  - `INVESTIGATING`: Under active investigation
  - `RESOLVED`: Discrepancy resolved
  - `FAILED`: Reconciliation failed
  - `APPROVED`: Approved for resolution
  - `REJECTED`: Resolution rejected

#### Run Types
- `SCHEDULED`: Automated scheduled reconciliation
- `MANUAL`: Manual reconciliation triggered by admin
- `FORCED`: Forced reconciliation with override
- `AUTO_RESOLVE`: Automatic resolution run

#### Admin Approval Workflow
- `requires_approval`: Flag for approval requirement
- `approved_by`: Admin who approved
- `approved_at`: Approval timestamp
- `rejection_reason`: Reason if rejected

#### Tracking
- Links to `reconciliation_history` records
- Run metadata in JSONB format
- Initiated by and resolved by tracking

### Use Cases
- Track all reconciliation attempts with full lifecycle
- Require approval for significant discrepancies
- Audit trail of all reconciliation actions
- Link reconciliation runs to history records

---

## 5. NGN Float Management Enhancements

### Features Implemented

#### Bank Account Registry
- **Table:** `bank_accounts`
- **Features:**
  - Multi-bank account support
  - Bank name, account number, account name
  - Nigerian bank code support
  - Environment tagging (DEV/STAGING/PRODUCTION)
  - Primary account designation
  - Current balance tracking
  - Last reconciliation timestamp

#### Threshold Alerts
- **Fields:**
  - `minimum_threshold`: Critical minimum balance
  - `alert_threshold`: Warning threshold
  - `alert_sent_at`: Last alert timestamp
- **Function:** `check_ngn_float_threshold()`
  - Checks all active bank accounts
  - Generates alerts when below thresholds
  - Prevents alert spam (1-hour cooldown)

#### Bank Reconciliation
- **Table:** `bank_reconciliation`
- **Features:**
  - Settlement mismatch detection
  - Float aging analysis (0-30, 31-60, 61-90, 90+ days)
  - Mismatch resolution tracking
  - Statement reference tracking

#### Settlement Mismatch Detection
- `has_mismatch`: Boolean flag
- `mismatch_reason`: Description of mismatch
- `mismatch_resolved`: Resolution status
- `resolved_by` and `resolved_at`: Resolution tracking

### Use Cases
- Track multiple bank accounts for NGN float
- Receive alerts when balances drop below thresholds
- Detect settlement mismatches between ledger and bank statements
- Analyze float aging for liquidity planning

---

## 6. Risk Controls & Emergency Systems

### Features Implemented

#### Global Emergency Kill Switch
- **Table:** `global_risk_controls`
- **Function:** `activate_kill_switch()`
- **Features:**
  - Single global kill switch for all operations
  - Activation reason and timestamp
  - Activated by tracking
  - Logs critical risk event

#### Asset-Level Auto-Disable
- **Function:** `check_asset_auto_disable()`
- **Logic:**
  - Auto-disables assets when discrepancy exceeds threshold
  - Configurable threshold percentage (default: 1%)
  - Respects global kill switch
  - Logs risk event when auto-disabled

#### Withdrawal Velocity Limits
- **Fields:**
  - `max_daily_withdrawals`: Daily limit
  - `max_hourly_withdrawals`: Hourly limit
  - `withdrawal_velocity_window_hours`: Time window

#### Trade Throttling
- **Fields:**
  - `trade_throttling_enabled`: Enable/disable throttling
  - `liquidity_threshold_percentage`: Threshold for throttling (default: 10%)
  - `throttle_factor`: Reduction factor when throttled (default: 0.5 = 50% reduction)

#### Risk Event Logging
- **Table:** `risk_events`
- **Event Types:**
  - `KILL_SWITCH_ACTIVATED` / `KILL_SWITCH_DEACTIVATED`
  - `ASSET_AUTO_DISABLED` / `ASSET_RE_ENABLED`
  - `WITHDRAWAL_LIMIT_EXCEEDED`
  - `TRADE_THROTTLE_ACTIVATED` / `TRADE_THROTTLE_DEACTIVATED`
  - `DISCREPANCY_DETECTED`
  - `LIQUIDITY_THRESHOLD_BREACH`
  - `PRICE_FEED_FAILURE`
- **Severity Levels:** LOW, MEDIUM, HIGH, CRITICAL
- **Features:**
  - Immutable audit log
  - Resolution tracking
  - System-triggered vs manual events

### Use Cases
- Emergency shutdown of all operations
- Automatic asset disabling on critical discrepancies
- Prevent withdrawal velocity attacks
- Throttle trading when liquidity is low
- Complete audit trail of all risk events

---

## 7. Pricing Engine Hardening

### Features Implemented

#### Multi-Source Price Aggregation
- **Table:** `price_sources`
- **Features:**
  - Multiple price source configuration
  - Source types: EXCHANGE, AGGREGATOR, ORACLE
  - Priority ranking (1-10, 1 = highest)
  - Reliability scoring (0-10)
  - Failure tracking (consecutive failures)
  - Active/inactive status

#### Price Data Storage
- **Table:** `asset_prices`
- **Features:**
  - Raw price data from each source
  - Price types: SPOT, BUY, SELL, AGGREGATED
  - Volume and 24h change tracking
  - Outlier detection flag
  - Deviation from median calculation

#### Aggregated Prices
- **Table:** `aggregated_prices`
- **Features:**
  - Final prices used by system (buy, sell, spot)
  - Median price calculation
  - Standard deviation tracking
  - Source count tracking

#### Last-Known Price Fallback
- **Fields:**
  - `last_known_price`: Last valid price
  - `last_known_price_at`: Timestamp
  - `using_fallback`: Boolean flag
- **Behavior:** Uses last known price when all sources fail

#### Price Deviation Circuit Breaker
- **Fields:**
  - `circuit_breaker_active`: Boolean flag
  - `circuit_breaker_reason`: Description
  - `circuit_breaker_activated_at`: Timestamp
- **Logic:**
  - Activates when price deviation > 10%
  - Logs critical risk event
  - Prevents trading with unreliable prices

#### Liquidity-Aware Pricing
- **Fields:**
  - `liquidity_factor`: Multiplier based on liquidity (default: 1.0)
  - `min_liquidity_threshold`: Minimum for normal pricing
- **Behavior:**
  - Adjusts buy/sell prices based on available liquidity
  - Increases spread when liquidity is low

#### Auto-Disable on Feed Failure
- **Fields:**
  - `is_disabled`: Boolean flag
  - `disabled_reason`: Description
  - `disabled_at`: Timestamp
- **Behavior:** Disables asset pricing when price feed fails

#### Price Aggregation Function
- **Function:** `aggregate_prices()`
- **Logic:**
  - Collects prices from all active sources
  - Calculates median price
  - Removes outliers (>3 standard deviations)
  - Applies circuit breaker if deviation too high
  - Adjusts for liquidity
  - Falls back to last known price if no sources available

### Use Cases
- Aggregate prices from multiple exchanges
- Detect and remove outlier prices
- Prevent trading during price feed failures
- Adjust pricing based on available liquidity
- Maintain service during temporary feed outages

---

## 8. Liquidity & Treasury Health Scoring

### Features Implemented

#### Health Score Calculation
- **Function:** `calculate_treasury_health_score()`
- **Score Range:** 0-100
- **Health Status:** GREEN (≥80), YELLOW (50-79), RED (<50)

#### Scoring Factors
1. **Discrepancy Penalties** (up to -40 points)
   - Large discrepancy (>5%): -40 points
   - Moderate discrepancy (1-5%): -20 points
   - Minor discrepancy (<1%): -10 points

2. **Liquidity Penalties** (up to -30 points)
   - Below minimum threshold: -30 points
   - Low liquidity (<50%): -20 points
   - Moderate liquidity (50-80%): -10 points

3. **Frozen Asset** (-50 points)
4. **Negative Inventory** (-60 points)
5. **On-Chain Lower Than Ledger** (-40 points, critical)

#### Fields Added to `treasury_reconciliation_status`
- `health_score`: Calculated score (0-100)
- `health_status`: GREEN, YELLOW, or RED
- `minimum_liquidity_threshold`: Minimum required liquidity
- `available_liquidity`: Current available liquidity (excludes pending/mismatched)
- `liquidity_percentage`: Percentage of ledger balance available

#### Liquidity Calculation
- **Function:** `get_available_liquidity()` (enhanced from existing)
- **Excludes:**
  - Pending balances
  - Assets with discrepancies (MISMATCH status)
  - Frozen assets
  - Negative inventory assets

### Use Cases
- Real-time health monitoring per asset
- Color-coded dashboard (Green/Yellow/Red)
- Identify assets requiring attention
- Track liquidity availability vs requirements

---

## 9. Audit, Compliance & Reporting

### Features Implemented

#### Enhanced Audit Logs
- **Table:** `audit_logs` (enhanced)
- **New Fields:**
  - `ip_address`: Client IP address
  - `user_agent`: Browser/client information
  - `session_id`: Session tracking
  - `regulatory_category`: FINANCIAL, OPERATIONAL, SECURITY, COMPLIANCE
  - `requires_retention`: Boolean flag
  - `retention_until`: Archive date
- **Features:**
  - Immutable records (no updates allowed)
  - Complete action traceability
  - Regulatory compliance fields

#### Treasury Reports
- **Table:** `treasury_reports`
- **Report Types:**
  - `RECONCILIATION_SUMMARY`: Reconciliation status and history
  - `INVENTORY_ADJUSTMENTS`: All inventory changes
  - `RISK_EVENTS`: Risk event log
  - `LIQUIDITY_ANALYSIS`: Liquidity breakdown
  - `BANK_RECONCILIATION`: Bank statement reconciliation
  - `COMPLIANCE_AUDIT`: Compliance audit trail
  - `HEALTH_SCORE`: Health score summary
  - `CUSTOM`: Custom reports

#### Report Formats
- JSON (default)
- CSV (for spreadsheet import)
- PDF (for regulatory submission)

#### Report Generation Function
- **Function:** `generate_reconciliation_report()`
- **Features:**
  - Date range filtering
  - Reconciliation status summary
  - Reconciliation history
  - Inventory adjustments summary
  - Regulatory flagging
  - Export tracking

#### Regulatory Features
- Regulatory category tagging
- Retention requirements
- Export count tracking
- Compliance-ready summaries

### Use Cases
- Generate regulatory reports for audits
- Export data for external analysis
- Track all admin actions with full context
- Maintain compliance with retention requirements
- Provide audit trail for all treasury operations

---

## Database Schema Summary

### New Tables Created

1. `wallet_types` - Wallet classification (Hot/Warm/Cold)
2. `wallet_registry` - Complete wallet registry with limits and rotation
3. `reconciliation_runs` - Reconciliation workflow tracking
4. `bank_accounts` - Multi-bank NGN float management
5. `bank_reconciliation` - Bank statement reconciliation
6. `global_risk_controls` - Global risk settings
7. `risk_events` - Risk event audit log
8. `price_sources` - Price feed source configuration
9. `asset_prices` - Raw price data from sources
10. `aggregated_prices` - Final aggregated prices
11. `treasury_reports` - Exportable reports
12. `audit_logs` - Enhanced audit trail

### Enhanced Tables

1. `inventory_adjustments` - Added expiry fields
2. `treasury_reconciliation_status` - Added tolerance, health scoring, liquidity fields

### Key Functions

1. `expire_unconfirmed_inventory()` - Auto-expire pending entries
2. `force_reconciliation()` - Enhanced with tolerance and auto-resolution
3. `check_ngn_float_threshold()` - NGN float alerting
4. `activate_kill_switch()` - Emergency kill switch
5. `check_asset_auto_disable()` - Auto-disable on discrepancy
6. `aggregate_prices()` - Multi-source price aggregation
7. `calculate_treasury_health_score()` - Health scoring
8. `generate_reconciliation_report()` - Report generation

---

## Security & Access Control

All tables have Row Level Security (RLS) enabled with:
- **Admin policies:** Admins can view all data
- **Service role policies:** Service role can manage all data
- **No public access:** Public users cannot access treasury data

---

## Next Steps

1. **Run the migration:**
   ```bash
   supabase migration up
   ```

2. **Initialize default data:**
   - Wallet types are auto-created
   - Global risk controls are auto-initialized

3. **Configure:**
   - Add wallet entries to `wallet_registry`
   - Configure price sources in `price_sources`
   - Set bank accounts in `bank_accounts`
   - Configure tolerance thresholds per asset

4. **Set up cron jobs:**
   - Schedule `expire_unconfirmed_inventory()` (e.g., every hour)
   - Schedule `check_ngn_float_threshold()` (e.g., every 15 minutes)
   - Schedule `aggregate_prices()` for each asset (e.g., every minute)

5. **Monitor:**
   - Review `risk_events` regularly
   - Monitor `treasury_reconciliation_status` health scores
   - Generate reports periodically for compliance

---

## Conclusion

This comprehensive treasury management system provides:

✅ **Complete wallet management** with classification and limits  
✅ **Robust inventory tracking** with auto-expiry  
✅ **Advanced reconciliation** with tolerance and auto-resolution  
✅ **Workflow engine** with approval processes  
✅ **Multi-bank NGN float** management  
✅ **Risk controls** with kill switch and auto-disable  
✅ **Hardened pricing** with multi-source aggregation  
✅ **Health scoring** with color-coded status  
✅ **Full audit trail** with regulatory compliance  

The system is now production-ready for scale, regulatory scrutiny, and institutional trust.
