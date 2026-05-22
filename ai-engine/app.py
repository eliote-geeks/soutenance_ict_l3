from fastapi import FastAPI

try:
    from .ns_ai_attack_profile import attack_knowledge_base
    from .ns_ai_attack_dict import attack_dictionary_status, refresh_attack_dictionary
    from .ns_ai_config import (
        DNS_ANOMALY_THRESHOLD,
        ELASTICSEARCH_URL,
        FINDING_SUPPRESSION_MINUTES,
        LOOKBACK_MINUTES,
        ML_BUCKET_MINUTES,
        ML_CONTAMINATION,
        ML_HISTORY_HOURS,
        ML_MIN_SAMPLES,
        NETSENTINEL_BACKEND_URL,
        PORT_SCAN_DISTINCT_PORT_THRESHOLD,
        RF_ALERT_PROBABILITY,
        RF_MIN_POSITIVE_SAMPLES,
        RF_MIN_SAMPLES,
        SSH_FAILURE_THRESHOLD,
    )
    from .ns_ai_detectors import run_detection_cycle
except ImportError:
    from ns_ai_attack_profile import attack_knowledge_base
    from ns_ai_attack_dict import attack_dictionary_status, refresh_attack_dictionary
    from ns_ai_config import (
        DNS_ANOMALY_THRESHOLD,
        ELASTICSEARCH_URL,
        FINDING_SUPPRESSION_MINUTES,
        LOOKBACK_MINUTES,
        ML_BUCKET_MINUTES,
        ML_CONTAMINATION,
        ML_HISTORY_HOURS,
        ML_MIN_SAMPLES,
        NETSENTINEL_BACKEND_URL,
        PORT_SCAN_DISTINCT_PORT_THRESHOLD,
        RF_ALERT_PROBABILITY,
        RF_MIN_POSITIVE_SAMPLES,
        RF_MIN_SAMPLES,
        SSH_FAILURE_THRESHOLD,
    )
    from ns_ai_detectors import run_detection_cycle


app = FastAPI(title="NetSentinel AI Engine", version="0.3.0")


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "elasticUrl": ELASTICSEARCH_URL,
        "backendUrl": NETSENTINEL_BACKEND_URL,
        "mlEnabled": {
            "isolationForest": True,
            "randomForest": True,
        },
    }


@app.get("/status")
async def status():
    return {
        "lookbackMinutes": LOOKBACK_MINUTES,
        "dedupWindowMinutes": FINDING_SUPPRESSION_MINUTES,
        "thresholds": {
            "sshFailure": SSH_FAILURE_THRESHOLD,
            "dnsAnomaly": DNS_ANOMALY_THRESHOLD,
            "portScanDistinctPorts": PORT_SCAN_DISTINCT_PORT_THRESHOLD,
        },
        "ml": {
            "enabled": True,
            "historyHours": ML_HISTORY_HOURS,
            "bucketMinutes": ML_BUCKET_MINUTES,
            "minSamples": ML_MIN_SAMPLES,
            "contamination": ML_CONTAMINATION,
            "randomForestMinSamples": RF_MIN_SAMPLES,
            "randomForestMinPositiveSamples": RF_MIN_POSITIVE_SAMPLES,
            "randomForestAlertProbability": RF_ALERT_PROBABILITY,
        },
        "attackDictionary": attack_dictionary_status(),
    }


@app.post("/refresh-attack-dictionary")
async def refresh_attack_dictionary_endpoint():
    return refresh_attack_dictionary(force=True)


@app.get("/attack-knowledge-base")
async def get_attack_knowledge_base():
    return attack_knowledge_base()


@app.post("/run-once")
async def run_once():
    return run_detection_cycle()
