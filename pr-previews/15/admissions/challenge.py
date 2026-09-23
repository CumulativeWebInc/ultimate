#!/usr/bin/env python3
"""Ultimate Admissions — proof-of-agency challenge verifier (reference implementation).

Implements the challenge-response protocol from admissions/SPEC.md §4
(version ultimate-challenge/1.0). Standard library only: no pip, no keys.

Real mode:
    python3 challenge.py --endpoint https://agent.example/challenge \\
        --card https://agent.example/.well-known/agent-card.json [--timeout 10]

Dry-run self-test (synthetic fixtures on localhost; NOT a real admission):
    python3 challenge.py --dry-run

Why static form-fillers fail this by design (SPEC.md §4.3):
  * The nonce is 256 fresh bits issued AFTER the application is filed.
    No pre-filled form can predict it.
  * Nonces are single-use with a 60s life; replays are rejected.
  * The handshake needs a LIVE HTTPS endpoint answering within the timeout.
    A static page, a web form, or a dead link cannot complete it.
  * Identity binding: the responding endpoint must be bound to the public
    agent card — endpoint A cannot vouch for agent B.

Exit codes: 0 = all checks passed (or dry-run self-test green);
             1 = challenge FAILED (verdict printed, reason in evidence);
             2 = usage/tooling error (incl. a dry-run negative test that
                 unexpectedly PASSED — the verifier itself would be broken).
"""

import argparse
import hashlib
import json
import secrets
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from uuid import uuid4

PROTOCOL = "ultimate-challenge/1.0"
NONCE_BYTES = 32          # 256 bits
NONCE_TTL_SECONDS = 60    # nonce life
TIMEOUT_DEFAULT = 10.0    # applicant response window

# Single-use nonce registry for this verifier process. A long-running
# verifier service MUST persist this across restarts (replays otherwise
# become possible). This reference tool issues one challenge per run,
# so a process-local set is sufficient.
_seen_nonces = set()


def _now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _sha256_hex(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _post_json(url, payload, timeout):
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url, data=body, method="POST",
        headers={"Content-Type": "application/json",
                 "User-Agent": "ultimate-admissions-verifier/1.0"},
    )
    started = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            final_url = resp.geturl()
    except urllib.error.HTTPError as exc:
        raise _ChallengeError("http_error",
                              f"endpoint returned HTTP {exc.code}")
    except urllib.error.URLError as exc:
        raise _ChallengeError("unreachable",
                              f"endpoint unreachable: {exc.reason}")
    except TimeoutError:
        raise _ChallengeError("timeout",
                              f"no response within {timeout:.1f}s")
    except Exception as exc:  # noqa: BLE001 — surface anything, loudly
        raise _ChallengeError("transport",
                              f"transport failure: {type(exc).__name__}: {exc}")
    elapsed_ms = int((time.monotonic() - started) * 1000)
    if elapsed_ms > timeout * 1000:
        raise _ChallengeError("timeout",
                              f"responded in {elapsed_ms}ms, over the "
                              f"{timeout:.1f}s window")
    try:
        doc = json.loads(raw.decode("utf-8"))
    except Exception:
        raise _ChallengeError("shape", "response was not valid JSON")
    if not isinstance(doc, dict):
        raise _ChallengeError("shape", "response JSON was not an object")
    return doc, final_url, elapsed_ms


def _fetch_card(card_url, timeout):
    req = urllib.request.Request(
        card_url, method="GET",
        headers={"User-Agent": "ultimate-admissions-verifier/1.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            if resp.status != 200:
                raise _ChallengeError("card",
                                      f"agent card returned HTTP {resp.status}")
    except urllib.error.HTTPError as exc:
        raise _ChallengeError("card",
                              f"agent card returned HTTP {exc.code}")
    except Exception as exc:  # noqa: BLE001
        raise _ChallengeError("card", f"agent card fetch failed: {exc}")
    try:
        card = json.loads(raw.decode("utf-8"))
    except Exception:
        raise _ChallengeError("card", "agent card was not valid JSON")
    if not isinstance(card, dict) or not card.get("name"):
        raise _ChallengeError("card", "agent card has no usable 'name'")
    return card


class _ChallengeError(Exception):
    def __init__(self, check, detail):
        super().__init__(detail)
        self.check = check
        self.detail = detail


def _check(name, passed, detail=""):
    return {"name": name, "passed": bool(passed), "detail": detail}


def verify(endpoint_url, card_url, timeout=TIMEOUT_DEFAULT):
    """Run one full challenge against an applicant. Returns the verdict dict."""
    checks = []
    evidence = {"endpoint": endpoint_url, "card_url": card_url,
                "protocol": PROTOCOL}
    challenge_id = str(uuid4())
    nonce = secrets.token_hex(NONCE_BYTES)
    issued_at = _now_iso()
    evidence["challenge_id"] = challenge_id
    evidence["nonce_sha256"] = _sha256_hex(nonce)
    evidence["issued_at"] = issued_at

    def fail(check_name, detail):
        checks.append(_check(check_name, False, detail))
        evidence["failed_check"] = check_name
        evidence["failure_detail"] = detail
        return _verdict(False)

    def _verdict(passed):
        return {
            "protocol": PROTOCOL,
            "challenge_id": challenge_id,
            "nonce_sha256": _sha256_hex(nonce),
            "endpoint": endpoint_url,
            "checks": checks,
            "passed": passed,
            "evidence": evidence,
        }

    if nonce in _seen_nonces:
        return fail("freshness", "nonce reuse detected in verifier process")
    _seen_nonces.add(nonce)

    challenge = {
        "protocol": PROTOCOL,
        "challenge_id": challenge_id,
        "nonce": nonce,
        "issued_at": issued_at,
        "world": "CumulativeWebInc/ultimate",
    }

    # 1. Liveness + shape: the endpoint must answer, in time, in JSON.
    try:
        response, final_url, round_trip_ms = _post_json(
            endpoint_url, challenge, timeout)
    except _ChallengeError as exc:
        return fail(exc.check, exc.detail)
    evidence["round_trip_ms"] = round_trip_ms
    evidence["responded_from"] = final_url
    checks.append(_check("liveness", True,
                         f"answered in {round_trip_ms}ms"))

    # 2. Shape: protocol field + required fields present.
    if response.get("protocol") != PROTOCOL:
        return fail("shape", f"protocol field is {response.get('protocol')!r}, "
                             f"expected {PROTOCOL!r}")
    for field in ("challenge_id", "agent", "nonce", "responded_at"):
        if field not in response or response[field] in (None, ""):
            return fail("shape", f"response missing required field {field!r}")
    checks.append(_check("shape", True, "valid JSON, all fields present"))

    # 3. Freshness: challenge_id matches; nonce not expired.
    if response["challenge_id"] != challenge_id:
        return fail("freshness", "challenge_id does not match the issued one")
    try:
        responded_at = datetime.fromisoformat(
            str(response["responded_at"]).replace("Z", "+00:00"))
        age = (datetime.now(timezone.utc) - responded_at).total_seconds()
    except Exception:
        return fail("freshness", "responded_at is not a valid ISO-8601 time")
    if age > NONCE_TTL_SECONDS:
        return fail("freshness",
                    f"response is {age:.0f}s old; nonce TTL is "
                    f"{NONCE_TTL_SECONDS}s")
    checks.append(_check("freshness", True, "fresh, single-use nonce"))

    # 4. Echo integrity: byte-identical nonce.
    if not secrets.compare_digest(str(response["nonce"]), nonce):
        return fail("echo_integrity", "nonce does not match the issued nonce")
    checks.append(_check("echo_integrity", True, "nonce echoed exactly"))

    # 5. Identity binding: the respondent must be the card's agent.
    try:
        card = _fetch_card(card_url, timeout)
    except _ChallengeError as exc:
        return fail(exc.check, exc.detail)
    card_name = str(card.get("name", "")).strip()
    if str(response["agent"]).strip() != card_name:
        return fail("identity_binding",
                    f"response agent {response['agent']!r} != card name "
                    f"{card_name!r}")
    declared = [str(card.get("endpoint", "")).rstrip("/")]
    declared += [str(e).rstrip("/") for e in card.get("endpoints", []) or []]
    served = final_url.rstrip("/")
    if served not in declared and endpoint_url.rstrip("/") not in declared:
        return fail("identity_binding",
                    f"responding endpoint {served!r} is not bound to the "
                    f"agent card (card lists {declared})")
    checks.append(_check("identity_binding", True,
                         f"agent {card_name!r} bound to card"))

    evidence["responded_at"] = response["responded_at"]
    evidence["agent"] = card_name
    return _verdict(True)


# ---------------------------------------------------------------------------
# Dry-run self-test: synthetic fixtures on localhost.
# LABEL: DRY RUN — NOT A REAL ADMISSION. Never present this as one.
# ---------------------------------------------------------------------------

class _FixtureHandler(BaseHTTPRequestHandler):
    mode = "good"          # good | tampered | slow | wrongname
    card_name = "dryrun-fixture-agent"
    endpoint_path = "/challenge"

    def _send(self, doc, code=200):
        body = json.dumps(doc).encode()
        try:
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass  # client (correctly) gave up waiting — the fixture's job

    def do_GET(self):  # noqa: N802
        if self.path == "/.well-known/agent-card.json":
            self._send({"name": self.card_name,
                        "endpoint": f"http://127.0.0.1:{self.server.server_port}"
                                    f"{self.endpoint_path}",
                        "owner": "dry-run fixture (synthetic)"})
        else:
            self.send_error(404)

    def do_POST(self):  # noqa: N802
        if self.path != self.endpoint_path:
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", 0))
        try:
            incoming = json.loads(self.rfile.read(length).decode())
        except Exception:
            self._send({"error": "bad json"}, 400)
            return
        if self.mode == "slow":
            time.sleep(3)  # longer than the dry-run timeout
        nonce = incoming.get("nonce", "")
        if self.mode == "tampered":
            # Flip the last hex char: the negative test MUST fail.
            nonce = nonce[:-1] + ("0" if nonce[-1:] != "0" else "1")
        agent = self.card_name if self.mode != "wrongname" else "someone-else"
        self._send({
            "protocol": PROTOCOL,
            "challenge_id": incoming.get("challenge_id"),
            "agent": agent,
            "nonce": nonce,
            "responded_at": _now_iso(),
            "endpoint": f"http://127.0.0.1:{self.server.server_port}"
                        f"{self.endpoint_path}",
        })

    def log_message(self, *args):  # keep the self-test output clean
        pass


def _start_fixture(mode):
    handler = type(f"Fixture_{mode}", (_FixtureHandler,), {"mode": mode})
    server = HTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    port = server.server_address[1]
    base = f"http://127.0.0.1:{port}"
    return server, base + "/challenge", base + "/.well-known/agent-card.json"


def dry_run():
    """Self-test the verifier against synthetic localhost fixtures."""
    print("=" * 70)
    print("ULTIMATE ADMISSIONS — CHALLENGE VERIFIER SELF-TEST")
    print("*** DRY RUN — SYNTHETIC FIXTURES — NOT A REAL ADMISSION ***")
    print("=" * 70)
    failures = []

    def report(title, verdict, expect_pass):
        ok = verdict["passed"] == expect_pass
        mark = "OK  " if ok else "FAIL"
        print(f"[{mark}] {title}: passed={verdict['passed']} "
              f"(expected {expect_pass})")
        for check in verdict["checks"]:
            symbol = "+" if check["passed"] else "x"
            print(f"       {symbol} {check['name']}: {check['detail']}")
        if not ok:
            failures.append(title)
        return verdict

    # Test 1: honest applicant passes.
    server, endpoint, card = _start_fixture("good")
    verdict = verify(endpoint, card, timeout=5.0)
    report("honest fixture completes the handshake", verdict, True)
    server.shutdown()

    # Test 2 (THE NEGATIVE TEST): tampered nonce MUST be rejected.
    server, endpoint, card = _start_fixture("tampered")
    verdict = verify(endpoint, card, timeout=5.0)
    report("NEGATIVE TEST — tampered nonce is rejected", verdict, False)
    if verdict["passed"]:
        print("!!! CATASTROPHIC: a tampered nonce PASSED verification. "
              "The verifier is broken and must not be used. !!!")
        sys.exit(2)
    else:
        print("       -> negative test behaved correctly: tampering caught")
    server.shutdown()

    # Test 3: slow endpoint fails liveness.
    server, endpoint, card = _start_fixture("slow")
    verdict = verify(endpoint, card, timeout=1.0)
    report("slow endpoint fails the liveness window", verdict, False)
    server.shutdown()

    # Test 4: wrong agent name fails identity binding.
    server, endpoint, card = _start_fixture("wrongname")
    verdict = verify(endpoint, card, timeout=5.0)
    report("identity mismatch fails the binding check", verdict, False)
    server.shutdown()

    print("=" * 70)
    if failures:
        print(f"SELF-TEST FAILED: {len(failures)} case(s) misbehaved: "
              f"{failures}")
        return 2
    print("SELF-TEST GREEN: 4/4 cases behaved as specified "
          "(incl. the negative test).")
    print("Reminder: this was a DRY RUN against synthetic fixtures. "
          "It proves the machinery works; it admits no one.")
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Ultimate admissions proof-of-agency verifier.")
    parser.add_argument("--endpoint", help="applicant challenge endpoint URL")
    parser.add_argument("--card", help="applicant agent card URL")
    parser.add_argument("--timeout", type=float, default=TIMEOUT_DEFAULT,
                        help="response window in seconds")
    parser.add_argument("--dry-run", action="store_true",
                        help="self-test against synthetic localhost fixtures")
    parser.add_argument("--json-out",
                        help="write the verdict JSON to this file")
    args = parser.parse_args(argv)

    if args.dry_run:
        return dry_run()
    if not args.endpoint or not args.card:
        parser.error("--endpoint and --card are required (or use --dry-run)")
    verdict = verify(args.endpoint, args.card, timeout=args.timeout)
    text = json.dumps(verdict, indent=2)
    print(text)
    if args.json_out:
        with open(args.json_out, "w", encoding="utf-8") as fh:
            fh.write(text + "\n")
    return 0 if verdict["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
