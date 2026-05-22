import sys
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
AI_ENGINE_ROOT = PROJECT_ROOT / "ai-engine"
for path in (PROJECT_ROOT, AI_ENGINE_ROOT):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from ns_ai_attack_profile import attack_knowledge_base, matching_attack_profiles, row_training_label  # noqa: E402
from backend import server  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


class AttackKnowledgeTestCase(unittest.TestCase):
    def test_attack_profiles_label_training_rows(self):
        benign = {
            "failed_logins": 0,
            "dns_errors": 0,
            "distinct_ports": 2,
            "privilege_indicators": 0,
            "defense_evasion_indicators": 0,
            "phishing_indicators": 0,
            "internal_remote_service_hits": 0,
            "exfil_bytes": 1024,
            "external_destinations": 1,
            "suspicious_archive_hits": 0,
        }
        brute_force = {**benign, "failed_logins": 12}

        self.assertEqual(row_training_label(benign), 0)
        self.assertEqual(row_training_label(brute_force), 1)
        self.assertEqual(matching_attack_profiles(brute_force)[0]["id"], "ssh_bruteforce")

    def test_attack_knowledge_base_contains_mitre_profiles(self):
        payload = attack_knowledge_base()
        self.assertGreaterEqual(payload["profileCount"], 8)
        profile_ids = {item["id"] for item in payload["profiles"]}
        self.assertIn("ssh_bruteforce", profile_ids)
        self.assertIn("dns_c2_anomaly", profile_ids)

    def test_backend_exposes_attack_knowledge_base_fallback(self):
        client = TestClient(server.app)
        response = client.get("/api/ai/attack-knowledge-base")
        self.assertEqual(response.status_code, 200)
        self.assertIn("profiles", response.json())


if __name__ == "__main__":
    unittest.main()
