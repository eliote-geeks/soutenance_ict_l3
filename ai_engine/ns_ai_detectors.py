from typing import Any

from sklearn.ensemble import IsolationForest, RandomForestClassifier

try:
    from .ns_ai_attack_dict import attack_dictionary_status
    from .ns_ai_attack_profile import row_training_label
    from .ns_ai_clients import backend_post
    from .ns_ai_config import (
        DNS_ANOMALY_THRESHOLD,
        ML_BUCKET_MINUTES,
        ML_CONTAMINATION,
        ML_HISTORY_HOURS,
        ML_MIN_SAMPLES,
        ML_RANDOM_STATE,
        PORT_SCAN_DISTINCT_PORT_THRESHOLD,
        RF_ALERT_PROBABILITY,
        RF_MIN_POSITIVE_SAMPLES,
        RF_MIN_SAMPLES,
        SSH_FAILURE_THRESHOLD,
    )
    from .ns_ai_features import aggregate_current_features, aggregate_historical_windows, feature_vector, filebeat_hits, packetbeat_hits
    from .ns_ai_heuristics import (
        detect_defense_evasion,
        detect_dns_anomaly,
        detect_exfiltration,
        detect_lateral_movement,
        detect_phishing,
        detect_port_scan,
        detect_privilege_escalation,
        detect_ssh_bruteforce,
        refs,
        severity_from_confidence,
    )
    from .ns_ai_schema import FindingPayload
    from .ns_ai_state import dedup_signature, load_state, mark_published, prune_state, save_state, should_publish
except ImportError:
    from ns_ai_attack_dict import attack_dictionary_status
    from ns_ai_attack_profile import row_training_label
    from ns_ai_clients import backend_post
    from ns_ai_config import (
        DNS_ANOMALY_THRESHOLD,
        ML_BUCKET_MINUTES,
        ML_CONTAMINATION,
        ML_HISTORY_HOURS,
        ML_MIN_SAMPLES,
        ML_RANDOM_STATE,
        PORT_SCAN_DISTINCT_PORT_THRESHOLD,
        RF_ALERT_PROBABILITY,
        RF_MIN_POSITIVE_SAMPLES,
        RF_MIN_SAMPLES,
        SSH_FAILURE_THRESHOLD,
    )
    from ns_ai_features import aggregate_current_features, aggregate_historical_windows, feature_vector, filebeat_hits, packetbeat_hits
    from ns_ai_heuristics import (
        detect_defense_evasion,
        detect_dns_anomaly,
        detect_exfiltration,
        detect_lateral_movement,
        detect_phishing,
        detect_port_scan,
        detect_privilege_escalation,
        detect_ssh_bruteforce,
        refs,
        severity_from_confidence,
    )
    from ns_ai_schema import FindingPayload
    from ns_ai_state import dedup_signature, load_state, mark_published, prune_state, save_state, should_publish


def detect_isolation_forest_anomalies(current_rows: list[dict[str, Any]], history_rows: list[dict[str, Any]]) -> list[FindingPayload]:
    if len(history_rows) < ML_MIN_SAMPLES or not current_rows:
        return []

    model = IsolationForest(contamination=ML_CONTAMINATION, random_state=ML_RANDOM_STATE, n_estimators=200)
    train_vectors = [feature_vector(row) for row in history_rows]
    model.fit(train_vectors)

    findings = []
    predictions = model.predict([feature_vector(row) for row in current_rows])
    scores = model.score_samples([feature_vector(row) for row in current_rows])
    min_score = min(scores) if len(scores) else -1.0
    max_score = max(scores) if len(scores) else 0.0

    for row, prediction, score in zip(current_rows, predictions, scores):
        if prediction != -1:
            continue
        span = max(max_score - min_score, 1e-6)
        anomaly_strength = (max_score - score) / span
        confidence = round(min(0.97, 0.58 + anomaly_strength * 0.34), 2)
        if int(row["dns_errors"]) >= max(int(row["failed_logins"]), int(row["distinct_ports"])):
            tactic, technique_refs = "Command and Control", refs("T1071.004")
        elif int(row["distinct_ports"]) > 0:
            tactic, technique_refs = "Discovery", refs("T1046")
        else:
            tactic, technique_refs = "Credential Access", refs("T1110")
        findings.append(
            FindingPayload(
                title="IsolationForest network anomaly detected",
                severity=severity_from_confidence(confidence),
                description=(
                    f"IsolationForest flagged {row['source_ip']} as an outlier on the live feature window "
                    f"(events={row['event_count']}, ports={row['distinct_ports']}, dns_errors={row['dns_errors']})."
                ),
                recommendation="Correlate this outlier with packet captures, system logs and neighboring hosts before containment.",
                source_ip=row["source_ip"],
                hostname=row["hostname"],
                mitre_tactic=tactic,
                mitre_techniques=technique_refs,
                confidence=confidence,
                playbook="Review the source host context, compare against baseline behavior and escalate if the anomaly repeats.",
            )
        )
    return findings


def detect_random_forest_anomalies(current_rows: list[dict[str, Any]], history_rows: list[dict[str, Any]]) -> list[FindingPayload]:
    if len(history_rows) < RF_MIN_SAMPLES or not current_rows:
        return []

    labels = []
    for row in history_rows:
        labels.append(row_training_label(row))

    if labels.count(1) < RF_MIN_POSITIVE_SAMPLES or labels.count(0) < RF_MIN_POSITIVE_SAMPLES:
        return []

    model = RandomForestClassifier(
        n_estimators=300,
        random_state=ML_RANDOM_STATE,
        class_weight="balanced",
        min_samples_leaf=2,
    )
    model.fit([feature_vector(row) for row in history_rows], labels)

    findings = []
    probabilities = model.predict_proba([feature_vector(row) for row in current_rows])
    for row, proba in zip(current_rows, probabilities):
        suspicious_probability = float(proba[1])
        if suspicious_probability < RF_ALERT_PROBABILITY:
            continue
        confidence = round(min(0.98, max(0.6, suspicious_probability)), 2)
        if int(row["internal_remote_service_hits"]) >= 3:
            tactic, technique_refs = "Lateral Movement", refs("T1021")
        elif int(row["exfil_bytes"]) >= 5_000_000:
            tactic, technique_refs = "Exfiltration", refs("T1041", "T1048")
        elif int(row["defense_evasion_indicators"]) >= 2:
            tactic, technique_refs = "Defense Evasion", refs("T1070", "T1562")
        elif int(row["privilege_indicators"]) >= 2:
            tactic, technique_refs = "Privilege Escalation", refs("T1548", "T1068")
        elif int(row["phishing_indicators"]) >= 2:
            tactic, technique_refs = "Initial Access", refs("T1566")
        elif int(row["dns_errors"]) >= max(int(row["failed_logins"]), int(row["distinct_ports"])):
            tactic, technique_refs = "Command and Control", refs("T1071.004")
        elif int(row["distinct_ports"]) > 0:
            tactic, technique_refs = "Discovery", refs("T1046")
        else:
            tactic, technique_refs = "Credential Access", refs("T1110")
        findings.append(
            FindingPayload(
                title="RandomForest suspicious activity detected",
                severity=severity_from_confidence(confidence),
                description=(
                    f"RandomForest estimated a {int(suspicious_probability * 100)}% probability of malicious behavior "
                    f"for {row['source_ip']} based on recent telemetry features."
                ),
                recommendation="Validate this suspicious pattern against logs, flow context and host behavior before containment.",
                source_ip=row["source_ip"],
                hostname=row["hostname"],
                mitre_tactic=tactic,
                mitre_techniques=technique_refs,
                confidence=confidence,
                playbook="Compare the feature window with historical baselines and confirm whether the source is authorized.",
            )
        )
    return findings


def publish_findings(findings: list[FindingPayload]) -> list[dict[str, Any]]:
    published = []
    state = prune_state(load_state())
    for finding in findings:
        if not should_publish(finding, state):
            continue
        response = backend_post("/api/ai/findings", finding.model_dump())
        published.append(response)
        mark_published(finding, state)
    save_state(state)
    return published


def run_detection_cycle() -> dict[str, Any]:
    log_hits = filebeat_hits(minutes=LOOKBACK_MINUTES, size=1000)
    network_hits = packetbeat_hits(minutes=LOOKBACK_MINUTES, size=2000)
    current_rows = aggregate_current_features(log_hits, network_hits)

    history_minutes = ML_HISTORY_HOURS * 60
    history_log_hits = filebeat_hits(minutes=history_minutes, size=5000)
    history_network_hits = packetbeat_hits(minutes=history_minutes, size=8000)
    history_rows = aggregate_historical_windows(history_log_hits, history_network_hits, ML_BUCKET_MINUTES)

    findings: list[FindingPayload] = []
    findings.extend(detect_ssh_bruteforce(current_rows))
    findings.extend(detect_dns_anomaly(current_rows))
    findings.extend(detect_port_scan(current_rows))
    findings.extend(detect_privilege_escalation(current_rows))
    findings.extend(detect_defense_evasion(current_rows))
    findings.extend(detect_lateral_movement(current_rows))
    findings.extend(detect_exfiltration(current_rows))
    findings.extend(detect_phishing(current_rows))
    findings.extend(detect_isolation_forest_anomalies(current_rows, history_rows))
    findings.extend(detect_random_forest_anomalies(current_rows, history_rows))

    unique = []
    seen = set()
    for finding in findings:
        key = dedup_signature(finding)
        if key in seen:
            continue
        seen.add(key)
        unique.append(finding)

    published = publish_findings(unique) if unique else []
    return {
        "lookbackMinutes": LOOKBACK_MINUTES,
        "filebeatDocuments": len(log_hits),
        "packetbeatDocuments": len(network_hits),
        "featureRows": len(current_rows),
        "historyRows": len(history_rows),
        "findingsDetected": len(unique),
        "published": published,
        "mlEnabled": {"isolationForest": True, "randomForest": True},
        "attackDictionary": attack_dictionary_status(),
    }
