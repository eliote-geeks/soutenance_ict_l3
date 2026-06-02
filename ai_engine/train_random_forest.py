"""
Train RandomForest on CICIDS2018 using exact columns
that match Packetbeat flow data extracted by aggregate_flow_features().

Feature vector (10 features, must match rf_feature_vector in ml_models.py):
  0  flow_packets_per_s   Flow Packets/s
  1  flow_bytes_per_s     Flow Bytes/s
  2  fwd_packets_length   Fwd Packets Length Total
  3  bwd_packets_length   Bwd Packets Length Total
  4  total_fwd_packets    Total Fwd Packets
  5  total_bwd_packets    Total Backward Packets
  6  down_up_ratio        Down/Up Ratio
  7  avg_packet_size      Avg Packet Size
  8  protocol             Protocol
  9  flow_duration_us     Flow Duration
"""

import sys, warnings
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report

from ai_engine.config import MODEL_DIR, RF_MODEL_PATH, RF_SCALER_PATH

DATASETS_DIR  = Path(__file__).parent / "datasets"
RANDOM_STATE  = 42
MAX_PER_CLASS = 15_000
MIN_PER_CLASS = 20

CICIDS_COLS = [
    "Flow Packets/s",
    "Flow Bytes/s",
    "Fwd Packets Length Total",
    "Bwd Packets Length Total",
    "Total Fwd Packets",
    "Total Backward Packets",
    "Down/Up Ratio",
    "Avg Packet Size",
    "Protocol",
    "Flow Duration",
    "Label",
]

LABEL_MAP = {
    "Benign":                          "normal",
    "Bot":                             "c2_beaconing",
    "DDoS":                            "ddos",
    "DoS Hulk":                        "dos",
    "DoS GoldenEye":                   "dos",
    "DoS slowloris":                   "dos",
    "DoS Slowhttptest":                "dos",
    "Heartbleed":                      "probe",
    "FTP-Patator":                     "bruteforce",
    "SSH-Patator":                     "bruteforce",
    "PortScan":                        "probe",
    "Infiltration":                    "lateral_movement",
    "Web Attack \ufffd Brute Force":   "web_attack",
    "Web Attack \ufffd XSS":           "web_attack",
    "Web Attack \ufffd Sql Injection": "web_attack",
}

def load() -> pd.DataFrame:
    files = sorted(DATASETS_DIR.glob("*.parquet"))
    print(f"Loading {len(files)} files...")
    dfs = []
    for f in files:
        print(f"  {f.name}...", end=" ", flush=True)
        df = pd.read_parquet(f, columns=CICIDS_COLS)
        df["Label"] = df["Label"].map(LABEL_MAP)
        df = df.dropna(subset=["Label"])
        print(f"{len(df):,} rows")
        dfs.append(df)
    return pd.concat(dfs, ignore_index=True)

def clean(df: pd.DataFrame) -> pd.DataFrame:
    feat_cols = [c for c in CICIDS_COLS if c != "Label"]
    for col in feat_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df[feat_cols] = df[feat_cols].replace(
        [np.inf, -np.inf], np.nan
    ).fillna(0)
    # Clip extreme outliers per column (keep 99.5th percentile)
    for col in feat_cols:
        cap = df[col].quantile(0.995)
        df[col] = df[col].clip(lower=0, upper=cap)
    return df

def balance(df: pd.DataFrame) -> pd.DataFrame:
    print("\nBalancing classes:")
    parts = []
    for label, grp in df.groupby("Label"):
        n = len(grp)
        if n < MIN_PER_CLASS:
            print(f"  SKIP  {label:<25} ({n} rows)")
            continue
        if n > MAX_PER_CLASS:
            grp = grp.sample(MAX_PER_CLASS, random_state=RANDOM_STATE)
            print(f"  CAP   {label:<25} {n:>8,} → {MAX_PER_CLASS:,}")
        else:
            print(f"  KEEP  {label:<25} {n:>8,}")
        parts.append(grp)
    return pd.concat(parts, ignore_index=True)

def main():
    print("=" * 60)
    print("NetSentinel RF — Real CICIDS2018 Training")
    print("=" * 60)

    df = load()
    df = clean(df)

    print(f"\nTotal: {len(df):,} rows")
    for lbl, cnt in df["Label"].value_counts().items():
        print(f"  {lbl:<25} {cnt:>10,}")

    df = balance(df)

    feat_cols = [c for c in CICIDS_COLS if c != "Label"]
    X = df[feat_cols].values.astype(float)
    y = df["Label"].values

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=RANDOM_STATE, stratify=y
    )

    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_test_s  = scaler.transform(X_test)

    print(f"\nTraining on {len(X_train):,} rows...")
    model = RandomForestClassifier(
        n_estimators=200,
        max_depth=20,
        min_samples_leaf=2,
        class_weight="balanced",
        random_state=RANDOM_STATE,
        n_jobs=-1,
        verbose=1,
    )
    model.fit(X_train_s, y_train)

    print("\n" + "=" * 60)
    print("TEST SET EVALUATION")
    print("=" * 60)
    print(classification_report(
        y_test, model.predict(X_test_s), zero_division=0
    ))

    print("=" * 60)
    print("FEATURE IMPORTANCE")
    print("=" * 60)
    your_names = [
        "flow_packets_per_s", "flow_bytes_per_s",
        "fwd_packets_length", "bwd_packets_length",
        "total_fwd_packets",  "total_bwd_packets",
        "down_up_ratio",      "avg_packet_size",
        "protocol",           "flow_duration_us",
    ]
    for name, imp in sorted(
        zip(your_names, model.feature_importances_), key=lambda x: -x[1]
    ):
        print(f"  {name:<25} {imp:.3f}  {'█' * int(imp * 60)}")

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model,  RF_MODEL_PATH)
    joblib.dump(scaler, RF_SCALER_PATH)
    print(f"\n✅ Model  → {RF_MODEL_PATH}")
    print(f"✅ Scaler → {RF_SCALER_PATH}")
    print(f"\nClasses: {sorted(model.classes_)}")

if __name__ == "__main__":
    main()
