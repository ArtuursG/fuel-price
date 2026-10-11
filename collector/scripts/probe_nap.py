"""Noskaidro, kas ir NAP EV datu kopas iekšā, neizpaužot piekļuves datus.

Palaiž pret .dev.vars ierakstītajām saitēm un izvada TIKAI atbildes formu:
statusu, lielumu, lauku nosaukumus un to, vai kaut kur ir cena. Saite un
API atslēga netiek drukāta nekur -- arī kļūdas gadījumā ne, tāpēc izvadu
var droši ielīmēt sarakstē.

Palaišana no repo saknes:
    uv run --project collector python collector/scripts/probe_nap.py
"""

from __future__ import annotations

import json
import os
import re
import sys

import httpx

# Windows konsole pec noklusejuma ir cp1252 un uzkrit uz latviesu burtiem.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from collector.core.env import load_dev_vars  # noqa: E402
from collector.core.http import DEFAULT_USER_AGENT  # noqa: E402

DATASETS = [
    ("Elektroauto uzlādes infrastruktūra", "NAP_EV_INFRA"),
    ("Elektromobiļu uzlādes staciju statuss", "NAP_EV_STATUS"),
    ("Elektrotransportlīdzekļu uzlādes infrastruktūra", "NAP_EV_INFRA_ECO"),
]

# Lauku nosaukumi, kas varetu nest cenu. Mekle gan anglu, gan latviesu vardus.
PRICE_HINT = re.compile(r"price|tariff|cost|fee|amount|currency|eur|cena|tarif|maksa|valuta", re.I)


def fetch(url: str, key: str | None) -> httpx.Response:
    """Mēģina galvenē, tad vaicājuma parametros -- NAP abus variantus lieto."""
    with httpx.Client(timeout=60.0, follow_redirects=True) as client:
        headers = {"User-Agent": DEFAULT_USER_AGENT, "Accept": "*/*"}
        if key:
            headers["x-api-key"] = key
        response = client.get(url, headers=headers)
        if response.status_code in (401, 403) and key:
            for param in ("apiKey", "api_key", "key"):
                retry = client.get(
                    url,
                    params={param: key},
                    headers={"User-Agent": DEFAULT_USER_AGENT, "Accept": "*/*"},
                )
                if retry.status_code == 200:
                    return retry
        return response


def walk_fields(
    node: object, prefix: str = "", out: set[str] | None = None, depth: int = 0
) -> set[str]:
    """Lauku ceļi, ne vērtības."""
    out = set() if out is None else out
    if depth > 4:
        return out
    if isinstance(node, dict):
        for name, value in node.items():
            path = f"{prefix}.{name}" if prefix else str(name)
            out.add(path)
            walk_fields(value, path, out, depth + 1)
    elif isinstance(node, list) and node:
        walk_fields(node[0], f"{prefix}[]", out, depth + 1)
    return out


def describe(title: str, var: str) -> None:
    url = os.environ.get(f"{var}_URL", "").strip()
    key = os.environ.get(f"{var}_KEY", "").strip() or None

    print(f"\n=== {title} ===")
    if not url:
        print(f"  izlaists: {var}_URL nav aizpildīts .dev.vars")
        return

    try:
        response = fetch(url, key)
    except Exception as exc:  # noqa: BLE001 -- gribam redzet jebkuru kludu, bez saites
        print(f"  pieprasījums neizdevās: {type(exc).__name__}")
        return

    body = response.content
    content_type = response.headers.get("content-type")
    print(f"  HTTP {response.status_code} | {len(body)} baiti | {content_type}")
    if response.status_code != 200:
        # Kludas tekstu radam isinatu -- taja saites nav, bet ierobezojam tapat.
        print(f"  atbildes sākums: {body[:160].decode('utf-8', 'replace')}")
        return

    try:
        data = json.loads(body)
    except ValueError:
        print(f"  nav JSON; sākums: {body[:160].decode('utf-8', 'replace')}")
        return

    if isinstance(data, dict):
        print(f"  augšējie atslēgvārdi: {sorted(data)[:12]}")
    elif isinstance(data, list):
        print(f"  saraksts ar {len(data)} ierakstiem")

    fields = sorted(walk_fields(data))
    print(f"  lauku ceļi: {len(fields)}")
    for path in fields[:40]:
        print(f"     {path}")
    if len(fields) > 40:
        print(f"     ... vēl {len(fields) - 40}")

    hits = [f for f in fields if PRICE_HINT.search(f)]
    print(f"  CENAS LAUKI: {hits if hits else 'nav atrasti'}")


def main() -> int:
    load_dev_vars()
    for title, var in DATASETS:
        describe(title, var)
    print("\n(Saites un atslēgas netiek drukātas.)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
