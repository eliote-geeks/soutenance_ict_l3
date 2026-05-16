"""
Train the RandomForest classifier on NSL-KDD-style synthetic data.
Run once to produce state/models/random_forest.pkl
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import classification_report

from ai_engine.config import MODEL_DIR, RF_MODEL_PATH, RF_SCALER_PATH

# ── Synthetic training data ─────────────────────────────────────────────────
# Features: event_count, is_internal, failed_logins, dns_errors,
#           distinct_ports, distinct_destinations, protocol_count, http_path_count

np.random.seed(42)

def make_samples(n, label, event_range, internal, logins, dns,
                 ports, dests, protos, paths):
    X = np.column_stack([
        np.random.randint(*event_range, n),   # event_count
        np.full(n, internal),                  # is_internal
        np.random.randint(*logins, n),         # failed_logins
        np.random.randint(*dns, n),            # dns_errors
        np.random.randint(*ports, n),          # distinct_ports
        np.random.randint(*dests, n),          # distinct_destinations
        np.random.randint(*protos, n),         # protocol_count
        np.random.randint(*paths, n),          # http_path_count
    ])
    y = np.full(n, label)
    return X, y

# Normal traffic
X_normal, y_normal   = make_samples(400, "normal",
    (10,200), 1, (0,1), (0,2), (1,5), (1,8), (1,4), (0,10))

# Brute force — many failed logins
X_brute, y_brute     = make_samples(200, "bruteforce",
    (50,300), 0, (15,80), (0,3), (1,3), (1,4), (1,3), (0,5))

# Port scan — many distinct ports
X_probe, y_probe     = make_samples(200, "probe",
    (100,500), 0, (0,2), (0,3), (20,100), (5,30), (2,6), (0,5))

# DoS — very high event count
X_dos, y_dos         = make_samples(200, "dos",
    (500,2000), 0, (0,2), (0,5), (1,4), (1,3), (1,3), (0,3))

# Privilege escalation — internal, some failed logins + sudo events
X_priv, y_priv       = make_samples(150, "privilege_escalation",
    (20,100), 1, (5,20), (0,3), (1,4), (1,5), (1,3), (0,4))

# Combine
X = np.vstack([X_normal, X_brute, X_probe, X_dos, X_priv]).astype(float)
y = np.concatenate([y_normal, y_brute, y_probe, y_dos, y_priv])

# ── Train ───────────────────────────────────────────────────────────────────
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

model = RandomForestClassifier(
    n_estimators=200,
    max_depth=12,
    min_samples_leaf=2,
    random_state=42,
    class_weight="balanced",
)
model.fit(X_scaled, y)

# ── Evaluate ────────────────────────────────────────────────────────────────
print("\n=== Training Report ===")
print(classification_report(y, model.predict(X_scaled)))
print(f"Classes: {model.classes_}")

# ── Save ────────────────────────────────────────────────────────────────────
MODEL_DIR.mkdir(parents=True, exist_ok=True)
joblib.dump(model, RF_MODEL_PATH)
joblib.dump(scaler, RF_SCALER_PATH)

print(f"\n✅ RandomForest saved to: {RF_MODEL_PATH}")
print(f"✅ Scaler saved to:        {RF_SCALER_PATH}")
