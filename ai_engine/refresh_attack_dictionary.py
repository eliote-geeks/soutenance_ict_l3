try:
    from ns_ai_attack_dict import refresh_attack_dictionary
except ImportError:
    from .ns_ai_attack_dict import refresh_attack_dictionary


if __name__ == "__main__":
    payload = refresh_attack_dictionary(force=True)
    print(payload.get("source"))
    print(payload.get("techniqueCount"))
    print(payload.get("refreshedAt"))
