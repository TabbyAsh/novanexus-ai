"""
Canonical JSON (RFC 8785 JCS-style) and hash chain implementation.

Key properties:
- Keys sorted lexicographically
- No whitespace (compact)
- UTF-8 encoding
- No NaN/Infinity (we use decimal strings)
- Deterministic output for identical data

Hash chain format:
SHA256(prev_hash + "\\n" + canonical(header) + "\\n" + canonical(payload))
"""
import hashlib
import json
from decimal import Decimal
from typing import Any, Dict, Optional


def _sort_keys_recursive(obj: Any) -> Any:
    """Recursively sort dictionary keys."""
    if isinstance(obj, dict):
        return {k: _sort_keys_recursive(v) for k, v in sorted(obj.items())}
    elif isinstance(obj, list):
        return [_sort_keys_recursive(item) for item in obj]
    elif isinstance(obj, Decimal):
        # Convert Decimal to string to avoid float precision issues
        return str(obj)
    elif isinstance(obj, float):
        # Check for NaN/Infinity - these should not appear in our payloads
        if obj != obj or obj == float('inf') or obj == float('-inf'):
            raise ValueError("NaN and Infinity are not allowed in canonical JSON")
        # Convert to string if it's a financial value
        return obj
    else:
        return obj


def canonical_json(obj: Any) -> str:
    """
    Produce canonical JSON string from object.
    
    Implements RFC 8785 JCS-style canonicalization:
    - Keys sorted lexicographically at all levels
    - No whitespace between elements
    - UTF-8 encoding
    - Consistent number formatting
    """
    sorted_obj = _sort_keys_recursive(obj)
    return json.dumps(
        sorted_obj,
        separators=(',', ':'),
        ensure_ascii=False,
        sort_keys=True
    )


def compute_event_hash(
    prev_hash: str,
    header_fields: Dict[str, Any],
    payload: Dict[str, Any]
) -> str:
    """
    Compute SHA-256 hash for an event in the chain.
    
    Format: SHA256(prev_hash + "\\n" + canonical(header) + "\\n" + canonical(payload))
    
    header_fields should NOT include 'hash' (we compute that).
    """
    # Ensure header doesn't include hash field
    header_clean = {k: v for k, v in header_fields.items() if k != 'hash'}
    
    canonical_header = canonical_json(header_clean)
    canonical_payload = canonical_json(payload)
    
    hash_input = f"{prev_hash}\n{canonical_header}\n{canonical_payload}"
    
    return hashlib.sha256(hash_input.encode('utf-8')).hexdigest()


def verify_event_hash(
    event_hash: str,
    prev_hash: str,
    header_fields: Dict[str, Any],
    payload: Dict[str, Any]
) -> bool:
    """Verify that an event's hash is correct."""
    computed = compute_event_hash(prev_hash, header_fields, payload)
    return computed == event_hash


# Genesis hash for the first event in a chain
GENESIS_HASH = "0" * 64  # 64 zeros (256 bits as hex)


def compute_chain_verification(events: list[Dict[str, Any]]) -> tuple[bool, Optional[str]]:
    """
    Verify an entire event chain.
    
    Returns (is_valid, error_message).
    If valid, error_message is None.
    """
    if not events:
        return True, None
    
    prev_hash = GENESIS_HASH
    
    for i, event in enumerate(events):
        header = {
            'id': event['id'],
            'ts': event['ts'],
            'actor_type': event['actor_type'],
            'actor_id': event['actor_id'],
            'org_id': event['org_id'],
            'session_id': event.get('session_id'),
            'event_type': event['event_type'],
            'entity_type': event['entity_type'],
            'entity_id': event['entity_id'],
        }
        
        # Parse payload if it's a string
        payload = event.get('payload_json', {})
        if isinstance(payload, str):
            payload = json.loads(payload)
        
        expected_prev = event.get('prev_hash', GENESIS_HASH)
        if expected_prev != prev_hash:
            return False, f"Event {i} ({event['id']}): prev_hash mismatch. Expected {prev_hash}, got {expected_prev}"
        
        computed_hash = compute_event_hash(prev_hash, header, payload)
        actual_hash = event.get('hash', '')
        
        if computed_hash != actual_hash:
            return False, f"Event {i} ({event['id']}): hash mismatch. Expected {computed_hash}, got {actual_hash}"
        
        prev_hash = actual_hash
    
    return True, None
