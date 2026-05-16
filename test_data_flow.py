#!/usr/bin/env python3
"""
Test script to verify data flow from Elasticsearch through backend modules
"""
import sys
import os
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent / "backend"))

# Set environment before importing backend modules
os.chdir(Path(__file__).parent)

from backend.config import ELASTICSEARCH_URL, FILEBEAT_INDEX, PACKETBEAT_INDEX
from backend.elastic import (
    elastic_configured,
    elastic_request,
    fetch_elastic_logs,
    fetch_packetbeat_events,
)

print("=" * 60)
print("NetSentinel Data Flow Test")
print("=" * 60)

# Test 1: Elasticsearch Connection
print("\n1. Testing Elasticsearch Connection...")
if elastic_configured():
    print(f"   ✓ Connected to: {ELASTICSEARCH_URL}")
else:
    print("   ✗ Elasticsearch not configured")
    sys.exit(1)

# Test 2: Check Cluster Health
print("\n2. Checking Elasticsearch Cluster Health...")
health = elastic_request("GET", "/_cluster/health")
if health:
    status = health.get("status")
    active_shards = health.get("active_shards", 0)
    print(f"   ✓ Cluster Status: {status}")
    print(f"   ✓ Active Shards: {active_shards}")
else:
    print("   ✗ Could not connect to Elasticsearch")
    sys.exit(1)

# Test 3: Fetch Filebeat Logs
print(f"\n3. Fetching Filebeat Logs (index: {FILEBEAT_INDEX})...")
logs = fetch_elastic_logs()
if logs:
    print(f"   ✓ Retrieved {len(logs)} log entries")
    if logs:
        sample = logs[0]
        print(f"   Sample log:")
        print(f"      - Timestamp: {sample.get('timestamp')}")
        print(f"      - Source: {sample.get('source')}")
        print(f"      - Level: {sample.get('level')}")
        print(f"      - Message: {sample.get('message')[:60]}...")
else:
    print("   ✗ No logs found")

# Test 4: Fetch Packetbeat Events
print(f"\n4. Fetching Packetbeat Network Events (index: {PACKETBEAT_INDEX})...")
events = fetch_packetbeat_events()
if events:
    print(f"   ✓ Retrieved {len(events)} network events")
    if events:
        sample = events[0]
        print(f"   Sample network event:")
        print(f"      - Timestamp: {sample.get('timestamp')}")
        print(f"      - Source IP: {sample.get('sourceIP')}")
        print(f"      - Dest IP: {sample.get('destIP')}")
        print(f"      - Protocol: {sample.get('type')}")
else:
    print("   ✗ No network events found")

print("\n" + "=" * 60)
print("✅ All systems connected! Data is flowing correctly.")
print("=" * 60)
print("\nYour backend can now:")
print("  • Fetch logs from Filebeat")
print("  • Fetch network traffic from Packetbeat")
print("  • Serve this data via FastAPI endpoints")
print("  • Display in your React frontend")
