import sys
import unittest
from copy import deepcopy
from pathlib import Path

from fastapi.testclient import TestClient

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend import server  # noqa: E402


class AgentFlowTestCase(unittest.TestCase):
    def setUp(self):
        self.store = {
            server.ASSETS_INDEX: {},
            server.PROFILES_INDEX: {},
            server.PROFILE_ASSETS_INDEX: {},
            server.AGENT_TOKENS_INDEX: {},
            server.AGENT_INSTANCES_INDEX: {},
        }
        self.originals = {
            "elastic_configured": server.elastic_configured,
            "elastic_index_doc": server.elastic_index_doc,
            "fetch_index_documents": server.fetch_index_documents,
            "ADMIN_API_SECRET": server.ADMIN_API_SECRET,
            "ELASTICSEARCH_URL": server.ELASTICSEARCH_URL,
            "ELASTICSEARCH_API_KEY": server.ELASTICSEARCH_API_KEY,
            "AGENT_ELASTIC_API_KEY": getattr(server, "AGENT_ELASTIC_API_KEY", None),
            "ALLOW_AGENT_BASIC_AUTH": getattr(server, "ALLOW_AGENT_BASIC_AUTH", False),
        }

        def fake_elastic_index_doc(index, doc_id, payload):
            self.store.setdefault(index, {})
            self.store[index][doc_id] = deepcopy(payload)
            return True

        def fake_fetch_index_documents(index, size=200):
            documents = list(self.store.get(index, {}).values())
            documents.sort(key=lambda item: (item.get("created_at", ""), item.get("id", "")))
            return deepcopy(documents[:size])

        server.elastic_configured = lambda: True
        server.elastic_index_doc = fake_elastic_index_doc
        server.fetch_index_documents = fake_fetch_index_documents
        server.ADMIN_API_SECRET = "test-secret"
        server.ELASTICSEARCH_URL = "http://elastic.local:9200"
        server.ELASTICSEARCH_API_KEY = "main-api-key"
        server.AGENT_ELASTIC_API_KEY = "agent-api-key"
        server.ALLOW_AGENT_BASIC_AUTH = False
        self.client = TestClient(server.app)

    def tearDown(self):
        server.elastic_configured = self.originals["elastic_configured"]
        server.elastic_index_doc = self.originals["elastic_index_doc"]
        server.fetch_index_documents = self.originals["fetch_index_documents"]
        server.ADMIN_API_SECRET = self.originals["ADMIN_API_SECRET"]
        server.ELASTICSEARCH_URL = self.originals["ELASTICSEARCH_URL"]
        server.ELASTICSEARCH_API_KEY = self.originals["ELASTICSEARCH_API_KEY"]
        server.AGENT_ELASTIC_API_KEY = self.originals["AGENT_ELASTIC_API_KEY"]
        server.ALLOW_AGENT_BASIC_AUTH = self.originals["ALLOW_AGENT_BASIC_AUTH"]

    def _admin_headers(self):
        return {"x-admin-secret": "test-secret"}

    def test_multi_machine_flow_with_approval_rejection_and_disable(self):
        token_a = self.client.post(
            "/api/agent/enrollment-tokens",
            headers=self._admin_headers(),
            json={
                "asset_id": "asset_lab_01",
                "profile_id": "profile_lab",
                "site": "yaounde-lab",
                "role": "workstation",
                "environment": "lab",
                "expires_in_minutes": 30,
                "single_use": True,
            },
        )
        self.assertEqual(token_a.status_code, 200)
        raw_token_a = token_a.json()["token"]["raw_token"]

        token_b = self.client.post(
            "/api/agent/enrollment-tokens",
            headers=self._admin_headers(),
            json={
                "asset_id": "asset_lab_02",
                "profile_id": "profile_lab",
                "site": "yaounde-lab",
                "role": "workstation",
                "environment": "lab",
                "expires_in_minutes": 30,
                "single_use": True,
            },
        )
        self.assertEqual(token_b.status_code, 200)
        raw_token_b = token_b.json()["token"]["raw_token"]

        enroll_a = self.client.post(
            "/api/agent/enroll",
            json={
                "token": raw_token_a,
                "hostname": "lab-client-01",
                "ip": "10.10.3.11",
                "os": "Windows 11",
                "agent_version": "1.1.0",
            },
        )
        enroll_b = self.client.post(
            "/api/agent/enroll",
            json={
                "token": raw_token_b,
                "hostname": "lab-client-02",
                "ip": "10.10.3.12",
                "os": "Ubuntu 24.04",
                "agent_version": "1.1.0",
            },
        )
        self.assertEqual(enroll_a.status_code, 200)
        self.assertEqual(enroll_b.status_code, 200)

        instance_a = enroll_a.json()["instance"]["id"]
        instance_b = enroll_b.json()["instance"]["id"]

        instances = self.client.get("/api/agent/instances", headers=self._admin_headers())
        self.assertEqual(instances.status_code, 200)
        self.assertEqual(len(instances.json()["instances"]), 2)

        approve = self.client.post(f"/api/agent/instances/{instance_a}/approve", headers=self._admin_headers())
        self.assertEqual(approve.status_code, 200)
        activation = approve.json()["activation"]
        self.assertEqual(activation["agent"]["name"], "NetSentinel Agent")
        self.assertEqual(activation["agent"]["version"], "1.1.0")
        self.assertEqual(activation["elastic"]["api_key"], "agent-api-key")
        self.assertNotIn("username", activation["elastic"])
        self.assertNotIn("password", activation["elastic"])

        checkin_approved = self.client.post(
            "/api/agent/checkin",
            json={
                "instance_id": instance_a,
                "hostname": "lab-client-01",
                "ip": "10.10.3.11",
                "os": "Windows 11",
                "activation_applied": False,
            },
        )
        self.assertEqual(checkin_approved.status_code, 200)
        self.assertEqual(checkin_approved.json()["instance"]["status"], "approved")

        checkin_active = self.client.post(
            "/api/agent/checkin",
            json={
                "instance_id": instance_a,
                "hostname": "lab-client-01",
                "ip": "10.10.3.11",
                "os": "Windows 11",
                "activation_applied": True,
                "capabilities": {"platform": "windows", "actions": ["block_ip", "collect_triage"]},
            },
        )
        self.assertEqual(checkin_active.status_code, 200)
        self.assertEqual(checkin_active.json()["instance"]["status"], "active")

        queued_action = self.client.post(
            f"/api/agent/instances/{instance_a}/actions",
            headers=self._admin_headers(),
            json={
                "action_type": "block_ip",
                "parameters": {"ip": "185.227.134.41"},
                "reason": "Contain SSH brute force source.",
            },
        )
        self.assertEqual(queued_action.status_code, 200)
        action_id = queued_action.json()["action"]["id"]

        heartbeat = self.client.post(
            "/api/agent/heartbeat",
            json={
                "instance_id": instance_a,
                "service_state": "running",
                "signals": {
                    "platform": "windows",
                    "hostname": "lab-client-01",
                    "source_ip": "10.10.3.11",
                    "failed_login_indicators": 7,
                    "privilege_indicators": 2,
                    "defense_evasion_indicators": 1,
                    "internal_remote_service_hits": 4,
                    "suspicious_processes": ["nmap", "7z"],
                },
            },
        )
        self.assertEqual(heartbeat.status_code, 200)
        self.assertEqual(heartbeat.json()["instance"]["service_state"], "running")
        self.assertEqual(len(heartbeat.json()["pending_actions"]), 1)
        self.assertEqual(heartbeat.json()["pending_actions"][0]["id"], action_id)

        action_result = self.client.post(
            "/api/agent/heartbeat",
            json={
                "instance_id": instance_a,
                "service_state": "running",
                "action_results": [
                    {
                        "action_id": action_id,
                        "success": True,
                        "output": "Blocked 185.227.134.41 locally.",
                        "finished_at": "2026-05-06T10:10:00+00:00",
                    }
                ],
            },
        )
        self.assertEqual(action_result.status_code, 200)

        reject = self.client.post(
            f"/api/agent/instances/{instance_b}/reject",
            headers=self._admin_headers(),
            json={"reason": "Machine not approved for the lab."},
        )
        self.assertEqual(reject.status_code, 200)

        rejected_checkin = self.client.post(
            "/api/agent/checkin",
            json={
                "instance_id": instance_b,
                "hostname": "lab-client-02",
                "ip": "10.10.3.12",
                "os": "Ubuntu 24.04",
                "activation_applied": False,
            },
        )
        self.assertEqual(rejected_checkin.status_code, 200)
        self.assertFalse(rejected_checkin.json()["success"])
        self.assertEqual(rejected_checkin.json()["instance"]["status"], "rejected")

        disable = self.client.post(
            f"/api/agent/instances/{instance_a}/disable",
            headers=self._admin_headers(),
            json={"reason": "Demo complete."},
        )
        self.assertEqual(disable.status_code, 200)
        self.assertEqual(disable.json()["instance"]["status"], "inactive")

        assets = self.client.get("/api/assets")
        self.assertEqual(assets.status_code, 200)
        payload = {item["id"]: item for item in assets.json()["assets"]}
        self.assertEqual(payload["asset_lab_01"]["agentStatus"], "inactive")

        instances_after = self.client.get("/api/agent/instances", headers=self._admin_headers())
        self.assertEqual(instances_after.status_code, 200)
        by_id = {item["id"]: item for item in instances_after.json()["instances"]}
        self.assertEqual(by_id[instance_b]["status"], "rejected")
        self.assertEqual(by_id[instance_a]["last_signals"]["failed_login_indicators"], 7)
        self.assertEqual(by_id[instance_a]["action_history"][-1]["status"], "completed")


if __name__ == "__main__":
    unittest.main()
