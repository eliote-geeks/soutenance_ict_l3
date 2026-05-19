#!/usr/bin/env python3
from __future__ import annotations

import argparse
import ipaddress
import json
import os
import re
import socket
import subprocess
import time
import urllib.error
import urllib.request
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REMOTE_ADMIN_PORTS = {22, 135, 139, 445, 3389, 5985, 5986}
SUSPICIOUS_PROCESS_TERMS = ("nmap", "netcat", "nc", "socat", "rclone", "scp", "rsync", "7z", "rar", "zip")
PRIVILEGE_TERMS = ("sudo", "pkexec", "setuid", "runas")
EVASION_TERMS = ("history -c", "setenforce 0", "auditctl", "iptables -f", "systemctl stop", "killall auditd")
PHISHING_TERMS = (".docm", ".xlsm", "attachment", "macro", "credential", "mail")
SAFE_PROCESS_NAME = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")
PROTECTED_PROCESS_NAMES = {
    "systemd",
    "init",
    "sshd",
    "sudo",
    "python",
    "python3",
    "bash",
    "sh",
    "filebeat",
    "packetbeat",
    "metricbeat",
    "netsentinel-agent-runtime",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def post_json(url: str, payload: dict[str, Any]) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def run_command(command: list[str], timeout: int = 20) -> str:
    return run_command_result(command, timeout=timeout)[1]


def run_command_result(command: list[str], timeout: int = 20) -> tuple[int, str]:
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=timeout, check=False)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return 127, ""
    return result.returncode, (result.stdout or "") + ("\n" + result.stderr if result.stderr else "")


def validate_action_ip(ip_value: str) -> tuple[bool, str]:
    try:
        parsed = ipaddress.ip_address(ip_value)
    except ValueError:
        return False, "Invalid IP value."
    if parsed.is_loopback or parsed.is_multicast or parsed.is_unspecified:
        return False, "Refusing to act on loopback, multicast or unspecified IP."
    return True, str(parsed)


def validate_process_name(value: str) -> tuple[bool, str]:
    process_name = value.strip()
    if not SAFE_PROCESS_NAME.fullmatch(process_name):
        return False, "Invalid process name."
    if process_name.lower() in PROTECTED_PROCESS_NAMES:
        return False, f"Refusing to terminate protected process {process_name}."
    return True, process_name


def validate_pid(value: str) -> tuple[bool, str]:
    try:
        pid = int(value)
    except ValueError:
        return False, "Invalid process id."
    if pid <= 1:
        return False, "Refusing to terminate system process id."
    code, output = run_command_result(["ps", "-p", str(pid), "-o", "comm="], timeout=10)
    if code == 0 and output.strip().lower() in PROTECTED_PROCESS_NAMES:
        return False, f"Refusing to terminate protected process {output.strip()}."
    return True, str(pid)


def source_ip_from_state(state: dict[str, Any]) -> str:
    value = str(state.get("ip") or "").strip()
    if value and value != "127.0.0.1":
        return value
    try:
        return socket.gethostbyname(socket.gethostname())
    except OSError:
        return "127.0.0.1"


def tail_lines(paths: list[Path], limit: int = 300) -> list[str]:
    items: deque[str] = deque(maxlen=limit)
    for path in paths:
        if not path.exists():
            continue
        try:
            with path.open(encoding="utf-8", errors="ignore") as handle:
                for line in handle:
                    items.append(line.strip())
        except OSError:
            continue
    return list(items)


def collect_log_signals() -> dict[str, int]:
    lines = tail_lines([Path("/var/log/auth.log"), Path("/var/log/syslog"), Path("/var/log/messages")], limit=400)
    failed = 0
    privilege = 0
    evasion = 0
    phishing = 0
    archive = 0
    for line in lines:
        lower = line.lower()
        if "failed password" in lower or "invalid user" in lower:
            failed += 1
        if any(token in lower for token in PRIVILEGE_TERMS):
            privilege += 1
        if any(token in lower for token in EVASION_TERMS):
            evasion += 1
        if any(token in lower for token in PHISHING_TERMS):
            phishing += 1
        if any(token in lower for token in (".zip", ".rar", ".7z", "archive upload", "exfil")):
            archive += 1
    return {
        "failed_login_indicators": failed,
        "privilege_indicators": privilege,
        "defense_evasion_indicators": evasion,
        "phishing_indicators": phishing,
        "suspicious_archive_hits": archive,
    }


def collect_process_signals() -> tuple[list[str], dict[str, int]]:
    output = run_command(["ps", "-eo", "pid=,comm=,args="], timeout=20)
    suspicious: list[str] = []
    privilege = 0
    evasion = 0
    phishing = 0
    archive = 0
    for line in output.splitlines():
        lower = line.lower()
        if any(term in lower for term in SUSPICIOUS_PROCESS_TERMS):
            suspicious.append(line.strip()[:120])
        if any(term in lower for term in PRIVILEGE_TERMS):
            privilege += 1
        if any(term in lower for term in EVASION_TERMS):
            evasion += 1
        if any(term in lower for term in PHISHING_TERMS):
            phishing += 1
        if any(term in lower for term in (".zip", ".rar", ".7z", "scp ", "rsync ", "rclone ")):
            archive += 1
    return suspicious[:12], {
        "privilege_indicators": privilege,
        "defense_evasion_indicators": evasion,
        "phishing_indicators": phishing,
        "suspicious_archive_hits": archive,
    }


def is_private_ip(value: str) -> bool:
    return value.startswith(("10.", "127.", "172.16.", "172.17.", "172.18.", "172.19.", "172.2", "192.168."))


def collect_network_signals() -> dict[str, int]:
    connections = run_command(["ss", "-tan"], timeout=20) or run_command(["netstat", "-tan"], timeout=20)
    listeners = run_command(["ss", "-ltn"], timeout=20) or run_command(["netstat", "-ltn"], timeout=20)
    internal_remote = 0
    external_destinations: set[str] = set()
    external_established = 0
    for line in connections.splitlines():
        if "ESTAB" not in line and "ESTABLISHED" not in line:
            continue
        parts = line.split()
        if len(parts) < 4:
            continue
        remote = parts[-1]
        if ":" not in remote:
            continue
        host, _, port_text = remote.rpartition(":")
        try:
            port = int(port_text)
        except ValueError:
            continue
        if host and not is_private_ip(host):
            external_destinations.add(host)
            external_established += 1
        if host and is_private_ip(host) and port in REMOTE_ADMIN_PORTS:
            internal_remote += 1
    listening_ports = sum(1 for line in listeners.splitlines() if ":" in line and "LISTEN" in line)
    return {
        "internal_remote_service_hits": internal_remote,
        "external_destinations": len(external_destinations),
        "external_established_connections": external_established,
        "listening_ports": listening_ports,
    }


def collect_signals(state: dict[str, Any]) -> dict[str, Any]:
    log_signals = collect_log_signals()
    suspicious_processes, process_signals = collect_process_signals()
    network_signals = collect_network_signals()
    merged = {
        "collected_at": utc_now(),
        "telemetry_version": "1.2",
        "platform": "linux",
        "hostname": state.get("hostname") or socket.gethostname(),
        "source_ip": source_ip_from_state(state),
        "suspicious_processes": suspicious_processes,
        "notes": [],
    }
    for payload in (log_signals, process_signals, network_signals):
        for key, value in payload.items():
            if isinstance(value, int):
                merged[key] = merged.get(key, 0) + value
    return merged


def build_event(signals: dict[str, Any]) -> dict[str, Any]:
    return {
        "@timestamp": signals["collected_at"],
        "message": (
            "NetSentinel agent telemetry "
            f"failed={signals.get('failed_login_indicators', 0)} "
            f"privilege={signals.get('privilege_indicators', 0)} "
            f"evasion={signals.get('defense_evasion_indicators', 0)} "
            f"lateral={signals.get('internal_remote_service_hits', 0)} "
            f"exfil={signals.get('external_destinations', 0)}"
        ),
        "log": {"level": "info"},
        "event": {"dataset": "netsentinel.agent"},
        "host": {"name": signals.get("hostname")},
        "source": {"ip": signals.get("source_ip")},
        "netsentinel": {"agent": {"signals": signals}},
    }


def append_ndjson(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=True) + "\n")


def collect_triage(output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    target = output_dir / f"triage-{int(time.time())}.json"
    payload = {
        "collected_at": utc_now(),
        "uname": run_command(["uname", "-a"]).strip(),
        "last_auth": tail_lines([Path("/var/log/auth.log")], limit=80),
        "processes": run_command(["ps", "-eo", "pid=,comm=,args="], timeout=20).splitlines()[:80],
        "connections": run_command(["ss", "-tan"], timeout=20).splitlines()[:80],
    }
    target.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return target


def apply_firewall_action(ip_value: str, remove: bool = False) -> tuple[bool, str]:
    valid, normalized_ip = validate_action_ip(ip_value)
    if not valid:
        return False, normalized_ip
    if remove:
        commands = [
            ["iptables", "-D", "INPUT", "-s", normalized_ip, "-j", "DROP"],
            ["ufw", "delete", "deny", "from", normalized_ip],
        ]
    else:
        commands = [
            ["iptables", "-C", "INPUT", "-s", normalized_ip, "-j", "DROP"],
            ["iptables", "-A", "INPUT", "-s", normalized_ip, "-j", "DROP"],
        ]
    for command in commands:
        code, output = run_command_result(command, timeout=15)
        if code == 0:
            return True, output.strip() or "Firewall command executed."
    return False, "No firewall command available."


def execute_action(action: dict[str, Any], triage_output_dir: Path) -> dict[str, Any]:
    action_id = str(action.get("id") or "")
    action_type = str(action.get("type") or "").lower()
    parameters = action.get("parameters") or {}
    result = {
        "action_id": action_id,
        "finished_at": utc_now(),
        "success": False,
        "output": "",
        "error": "",
    }
    try:
        if action_type == "block_ip":
            result["success"], result["output"] = apply_firewall_action(str(parameters.get("ip") or ""))
        elif action_type == "unblock_ip":
            result["success"], result["output"] = apply_firewall_action(str(parameters.get("ip") or ""), remove=True)
        elif action_type == "terminate_process_by_name":
            valid, target = validate_process_name(str(parameters.get("name") or ""))
            if not valid:
                result["error"] = target
                return result
            code, output = run_command_result(["pkill", "-x", target], timeout=15)
            result["success"] = code == 0
            result["output"] = output.strip() or f"Requested termination for process name {target}."
        elif action_type == "terminate_process_by_pid":
            valid, pid = validate_pid(str(parameters.get("pid") or ""))
            if not valid:
                result["error"] = pid
                return result
            code, output = run_command_result(["kill", "-9", pid], timeout=15)
            result["success"] = code == 0
            result["output"] = output.strip() or f"Requested termination for pid {pid}."
        elif action_type == "collect_triage":
            artifact = collect_triage(triage_output_dir)
            result["success"] = True
            result["output"] = str(artifact)
        else:
            result["error"] = f"Unsupported action {action_type}."
    except Exception as exc:  # noqa: BLE001
        result["error"] = str(exc)
    if not result["success"] and not result["error"]:
        result["error"] = "Action failed."
    return result


def loop(state_file: Path, signal_log_path: Path, triage_output_dir: Path) -> None:
    while True:
        state = read_json(state_file)
        instance_id = str(state.get("instance_id") or "").strip()
        api_url = str(state.get("api_url") or "").rstrip("/")
        interval = max(60, int(state.get("runtime_heartbeat_interval_seconds") or 300))
        if not instance_id or not api_url:
            raise RuntimeError("Agent state is missing instance_id or api_url.")

        signals = collect_signals(state)
        append_ndjson(signal_log_path, build_event(signals))
        heartbeat = post_json(
            f"{api_url}/api/agent/heartbeat",
            {
                "instance_id": instance_id,
                "service_state": "running",
                "signals": signals,
            },
        )
        pending_actions = heartbeat.get("pending_actions") or []
        if pending_actions:
            results = [execute_action(action, triage_output_dir) for action in pending_actions]
            append_ndjson(
                signal_log_path,
                {
                    "@timestamp": utc_now(),
                    "message": f"NetSentinel agent applied {len(results)} local action(s).",
                    "log": {"level": "info"},
                    "event": {"dataset": "netsentinel.agent.actions"},
                    "host": {"name": signals.get("hostname")},
                    "source": {"ip": signals.get("source_ip")},
                    "netsentinel": {"agent": {"action_results": results}},
                },
            )
            post_json(
                f"{api_url}/api/agent/heartbeat",
                {
                    "instance_id": instance_id,
                    "service_state": "running",
                    "action_results": results,
                },
            )
        time.sleep(interval)


def main() -> int:
    parser = argparse.ArgumentParser(description="NetSentinel Linux agent runtime")
    parser.add_argument("--state-file", default="/etc/netsentinel-agent/agent.json")
    parser.add_argument("--signal-log", default="/var/log/netsentinel-agent/signals.ndjson")
    parser.add_argument("--triage-dir", default="/var/log/netsentinel-agent/triage")
    args = parser.parse_args()
    loop(Path(args.state_file), Path(args.signal_log), Path(args.triage_dir))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
