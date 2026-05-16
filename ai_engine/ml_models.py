"""
ml_models.py
------------
Machine learning detectors for the AI Engine.

Contains:
  - IsolationForest  (unsupervised — detects UNKNOWN anomalies)
  - RandomForest     (supervised  — classifies KNOWN attack types)

Models are saved to disk with joblib after training so they don't
retrain from scratch on every detection cycle.

To retrain: delete the .pkl files in state/models/ and restart.
"""

from typing import Any

import joblib

try:
    from sklearn.ensemble import IsolationForest, RandomForestClassifier
    from sklearn.preprocessing import StandardScaler
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False

from .config import (
    IFOREST_MODEL_PATH,
    IFOREST_SCALER_PATH,
    ML_CONTAMINATION,
    ML_MIN_SAMPLES,
    ML_RANDOM_STATE,
    MODEL_DIR,
    RF_MODEL_PATH,
    RF_SCALER_PATH,
)
from .features import feature_vector
from .schemas import FindingPayload


# ---------------------------------------------------------------------------
# MITRE tactic mapping for Random Forest attack classes
# ---------------------------------------------------------------------------

ATTACK_MITRE: dict[str, tuple[str, str]] = {
    "bruteforce":           ("Credential Access",    "critical"),
    "probe":                ("Discovery",            "high"),
    "dos":                  ("Impact",               "critical"),
    "privilege_escalation": ("Privilege Escalation", "critical"),
    "other":                ("Execution",            "medium"),
}


# ---------------------------------------------------------------------------
# Isolation Forest — model persistence
# ---------------------------------------------------------------------------

def save_iforest_model(model: Any, scaler: Any) -> None:
    """Persist the trained IsolationForest and its scaler to disk."""
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, IFOREST_MODEL_PATH)
    joblib.dump(scaler, IFOREST_SCALER_PATH)


def load_iforest_model() -> tuple[Any, Any]:
    """
    Load a previously saved IsolationForest model and scaler.
    Returns (None, None) if no saved model exists yet.
    """
    if IFOREST_MODEL_PATH.exists() and IFOREST_SCALER_PATH.exists():
        return joblib.load(IFOREST_MODEL_PATH), joblib.load(IFOREST_SCALER_PATH)
    return None, None


# ---------------------------------------------------------------------------
# Isolation Forest — detector
# ---------------------------------------------------------------------------

def detect_ml_anomalies(
    current_rows: list[dict[str, Any]],
    history_rows: list[dict[str, Any]],
) -> list[FindingPayload]:
    """
    Detect unknown anomalies using IsolationForest.

    - Trains on historical baseline data (saved to disk after first run)
    - Flags any current row whose feature vector is an outlier
    - Unsupervised: no labels needed — detects anything unusual
    """
    if not SKLEARN_AVAILABLE or not current_rows:
        return []

    model, scaler = load_iforest_model()

    # Train only if no saved model exists yet
    if model is None:
        if len(history_rows) < ML_MIN_SAMPLES:
            return []  # Not enough history to train yet
        scaler = StandardScaler()
        train_vectors = scaler.fit_transform(
            [feature_vector(r) for r in history_rows]
        )
        model = IsolationForest(
            contamination=ML_CONTAMINATION,
            random_state=ML_RANDOM_STATE,
            n_estimators=200,
        )
        model.fit(train_vectors)
        save_iforest_model(model, scaler)

    # Score current rows against trained baseline
    current_vectors = scaler.transform([feature_vector(r) for r in current_rows])
    predictions = model.predict(current_vectors)
    scores = model.score_samples(current_vectors)

    findings = []
    for row, prediction, score in zip(current_rows, predictions, scores):
        if prediction != -1:
            continue  # -1 = anomaly, 1 = normal

        # Convert anomaly score to confidence (more negative = more anomalous)
        confidence = round(min(0.97, 0.58 + abs(score) * 0.4), 2)

        findings.append(
            FindingPayload(
                title="ML network anomaly detected",
                severity=_severity_from_confidence(confidence),
                description=(
                    f"IsolationForest flagged {row['source_ip']} as an outlier "
                    f"on the live feature window "
                    f"(events={row['event_count']}, "
                    f"ports={row['distinct_ports']}, "
                    f"dns_errors={row['dns_errors']})."
                ),
                recommendation=(
                    "Correlate this outlier with packet captures and system logs "
                    "before taking containment action."
                ),
                source_ip=row["source_ip"],
                hostname=row["hostname"],
                mitre_tactic=(
                    "Discovery"
                    if row["distinct_ports"] >= row["dns_errors"]
                    else "Command and Control"
                ),
                confidence=confidence,
                playbook=(
                    "Review the source host context, compare against baseline "
                    "behavior and escalate if the anomaly repeats."
                ),
            )
        )
    return findings


# ---------------------------------------------------------------------------
# Random Forest — model persistence
# ---------------------------------------------------------------------------

def load_rf_model() -> tuple[Any, Any]:
    """
    Load a previously trained RandomForest model and its scaler.
    Returns (None, None) if no saved model exists.

    To create the model: run train_random_forest.py once (see project docs).
    """
    if RF_MODEL_PATH.exists() and RF_SCALER_PATH.exists():
        return joblib.load(RF_MODEL_PATH), joblib.load(RF_SCALER_PATH)
    return None, None


# ---------------------------------------------------------------------------
# Random Forest — detector
# ---------------------------------------------------------------------------

def rf_feature_vector(row: dict[str, Any]) -> list[float]:
    """
    Feature vector for the Random Forest classifier.
    Maps live aggregated features to the format the RF model expects.
    """
    return [
        float(row["event_count"]),           # traffic volume
        float(row["is_internal"]),            # internal source flag
        float(row["failed_logins"]),          # failed authentication count
        float(row["dns_errors"]),             # DNS error count
        float(row["distinct_ports"]),         # port diversity
        float(row["distinct_destinations"]),  # destination diversity
        float(row["protocol_count"]),         # protocol diversity
        float(row["http_path_count"]),        # HTTP activity
    ]


def detect_rf_attacks(
    current_rows: list[dict[str, Any]],
) -> list[FindingPayload]:
    """
    Classify known attack types using a pre-trained RandomForest.

    - Supervised: must be trained on labeled data first (NSL-KDD / CICIDS 2017)
    - Run train_random_forest.py once to produce the saved model
    - Skips predictions with confidence below 0.60 to reduce false positives
    """
    if not SKLEARN_AVAILABLE or not current_rows:
        return []

    model, scaler = load_rf_model()
    if model is None:
        # Model not trained yet — silently skip (will work once trained)
        return []

    vectors = scaler.transform([rf_feature_vector(r) for r in current_rows])
    predictions = model.predict(vectors)
    probabilities = model.predict_proba(vectors)

    findings = []
    for row, pred, proba in zip(current_rows, predictions, probabilities):
        if pred == "normal":
            continue

        confidence = round(float(max(proba)), 2)
        if confidence < 0.60:
            continue  # Skip low-confidence predictions

        mitre, severity = ATTACK_MITRE.get(pred, ("Discovery", "medium"))
        attack_label = pred.replace("_", " ").title()

        findings.append(
            FindingPayload(
                title=f"Random Forest: {attack_label} detected",
                severity=severity,
                description=(
                    f"RF classifier detected a {attack_label} pattern from "
                    f"{row['source_ip']} (confidence={confidence:.0%})."
                ),
                recommendation=(
                    f"Investigate {attack_label} indicators on "
                    f"{row['hostname'] or row['source_ip']}."
                ),
                source_ip=row["source_ip"],
                hostname=row["hostname"],
                mitre_tactic=mitre,
                confidence=confidence,
                playbook=(
                    "Review packet captures, correlate with host logs "
                    "and contain the source if the classification is confirmed."
                ),
            )
        )
    return findings


# ---------------------------------------------------------------------------
# Internal helper
# ---------------------------------------------------------------------------

def _severity_from_confidence(confidence: float) -> str:
    if confidence >= 0.9:
        return "critical"
    if confidence >= 0.78:
        return "high"
    if confidence >= 0.62:
        return "medium"
    return "low"