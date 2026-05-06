from typing import Any

from fastapi import HTTPException
from sklearn.ensemble import IsolationForest, RandomForestClassifier

try:
    from .ns_ai_attack_dict import attack_dictionary_status, lookup_attack_patterns, technique_reference
    from .ns_ai_clients import backend_post
    from .ns_ai_config import (
        DNS_ANOMALY_THRESHOLD,
        FINDING_SUPPRESSION_MINUTES,
        LOOKBACK_MINUTES,
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
    from .ns_ai_schema import FindingPayload
    from .ns_ai_state import dedup_signature, load_state, mark_published, prune_state, save_state, should_publish
except ImportError:
    from ns_ai_attack_dict import attack_dictionary_status, lookup_attack_patterns, technique_reference
    from ns_ai_clients import backend_post
    from ns_ai_config import (
        DNS_ANOMALY_THRESHOLD,
        FINDING_SUPPRESSION_MINUTES,
        LOOKBACK_MINUTES,
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
    from ns_ai_schema import FindingPayload
    from ns_ai_state import dedup_signature, load_state, mark_published, prune_state, save_state, should_publish


def confidence_from_ratio(observed: int, threshold: int, floor: float, ceiling: float) -> float:
    if threshold <= 0:
        return ceiling
    ratio = observed / threshold
    scaled = floor + min(max(ratio - 1, 0), 2) * ((ceiling - floor) / 2)
    return round(min(ceiling, max(floor, scaled)), 2)


def severity_from_confidence(confidence: float) -> str:
    if confidence >= 0.9:
        return "critical"
    if confidence >= 0.78:
        return "high"
    if confidence >= 0.62:
        return "medium"
    return "low"


def infer_attack_references(*, failed_logins: int = 0, dns_errors: int = 0, distinct_ports: int = 0) -> tuple[str, list[dict[str, str]]]:
    if failed_logins >= max(dns_errors, distinct_ports):
        refs = [technique_reference("T1110")] or lookup_attack_patterns(technique_ids=["T1110"], limit=1)
        return "Credential Access", refs
    if dns_errors >= max(failed_logins, distinct_ports):
        refs = [technique_reference("T1071.004")] or lookup_attack_patterns(technique_ids=["T1071.004"], limit=1)
        return "Command and Control", refs
    refs = [technique_reference("T1046")] or lookup_attack_patterns(technique_ids=["T1046"], limit=1)
    return "Discovery", refs


def detect_ssh_bruteforce(feature_rows: list[dict[str, Any]]) -> list[FindingPayload]:
    findings = []
    for row in feature_rows:
        count = int(row["failed_logins"])
        if count < SSH_FAILURE_THRESHOLD:
            continue
        confidence = confidence_from_ratio(count, SSH_FAILURE_THRESHOLD, 0.74, 0.97)
        tactic, refs = infer_attack_references(failed_logins=count)
        findings.append(
            FindingPayload(
                title="SSH brute force suspected",
                severity=severity_from_confidence(confidence),
                description=f"{count} failed SSH authentications observed in the last {LOOKBACK_MINUTES} minutes from {row['source_ip']}.",
                recommendation="Block the source IP, enforce SSH key authentication and review auth logs for account targeting.",
                source_ip=row["source_ip"],
                hostname=row["hostname"],
                mitre_tactic=tactic,
                mitre_techniques=refs,
                confidence=confidence,
                playbook="Inspect /var/log/auth.log, validate fail2ban bans, disable password authentication and rotate exposed credentials.",
            )
        )
    return findings


def detect_dns_anomaly(feature_rows: list[dict[str, Any]]) -> list[FindingPayload]:
    findings = []
    for row in feature_rows:
        count = int(row["dns_errors"])
        if count < DNS_ANOMALY_THRESHOLD:
            continue
        confidence = confidence_from_ratio(count, DNS_ANOMALY_THRESHOLD, 0.62, 0.9)
        tactic, refs = infer_attack_references(dns_errors=count)
        findings.append(
            FindingPayload(
                title="DNS anomaly burst detected",
                severity=severity_from_confidence(confidence),
                description=f"{count} DNS errors observed from {row['source_ip']} in the last {LOOKBACK_MINUTES} minutes.",
                recommendation="Inspect the querying workload, review DNS resolution failures and isolate the host if the burst persists.",
                source_ip=row["source_ip"],
                hostname=row["hostname"],
                mitre_tactic=tactic,
                mitre_techniques=refs,
                confidence=confidence,
                playbook="Review queried domains, inspect the originating process and compare with normal DNS behavior.",
            )
        )
    return findings


def detect_port_scan(feature_rows: list[dict[str, Any]]) -> list[FindingPayload]:
    findings = []
    for row in feature_rows:
        distinct_ports = int(row["distinct_ports"])
        if distinct_ports < PORT_SCAN_DISTINCT_PORT_THRESHOLD:
            continue
        confidence = confidence_from_ratio(distinct_ports, PORT_SCAN_DISTINCT_PORT_THRESHOLD, 0.68, 0.93)
        tactic, refs = infer_attack_references(distinct_ports=distinct_ports)
        findings.append(
            FindingPayload(
                title="Port scan behavior suspected",
                severity=severity_from_confidence(confidence),
                description=f"{distinct_ports} distinct destination ports contacted by {row['source_ip']} in the last {LOOKBACK_MINUTES} minutes.",
                recommendation="Block the scanner, verify exposed services and reduce the externally reachable attack surface.",
                source_ip=row["source_ip"],
                hostname=row["hostname"],
                mitre_tactic=tactic,
                mitre_techniques=refs,
                confidence=confidence,
                playbook="Check firewall rules, review targeted ports and confirm whether the traffic is authorized scanning.",
            )
        )
    return findings


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
        tactic, refs = infer_attack_references(
            failed_logins=int(row["failed_logins"]),
            dns_errors=int(row["dns_errors"]),
            distinct_ports=int(row["distinct_ports"]),
        )
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
                mitre_techniques=refs,
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
        suspicious = (
            int(row["failed_logins"]) >= SSH_FAILURE_THRESHOLD
            or int(row["dns_errors"]) >= DNS_ANOMALY_THRESHOLD
            or int(row["distinct_ports"]) >= PORT_SCAN_DISTINCT_PORT_THRESHOLD
        )
        labels.append(1 if suspicious else 0)

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
        tactic, refs = infer_attack_references(
            failed_logins=int(row["failed_logins"]),
            dns_errors=int(row["dns_errors"]),
            distinct_ports=int(row["distinct_ports"]),
        )
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
                mitre_techniques=refs,
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
