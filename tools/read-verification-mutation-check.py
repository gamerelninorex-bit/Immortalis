#!/usr/bin/env python3
"""R-01 mechanism falsifiers. Temporarily weaken runtime code, require named test failures,
and restore the exact original bytes after each run and on interruption. Never accepts an
import/setup/timeout failure as a kill. Run with Node 22 / pnpm 10 on PATH, from any directory.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path)
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[1]
    output = args.output_dir or Path(tempfile.mkdtemp(prefix="immortalis-read-mutants-"))
    output.mkdir(parents=True, exist_ok=True)
    dependencies = repo / "packages/engine/src/world/read-verification.ts"
    campaign = repo / "packages/engine/src/world/canonical-campaign.ts"
    test = repo / "tests/integration/read-verification.test.ts"
    originals = {p: p.read_bytes() for p in (dependencies, campaign)}
    for path, data in originals.items():
        committed = subprocess.check_output(
            ["git", "show", "HEAD:" + str(path.relative_to(repo))], cwd=repo
        )
        if data != committed:
            raise RuntimeError("refusing to mutate an uncommitted runtime file: " + str(path))

    # Each replacement must apply exactly once. Source and test hashes plus exact edits are
    # retained, so these local falsifiers are reproducible without claiming unseen reviewer patches.
    variants = [
        ("M1-ignore-facts-and-head", dependencies,
         "      const value = read();",
         '      const value = read();\n      if (key === "head" || key === "listFacts") return value;',
         r"does not trust an unchanged head"),
        ("M2-omit-receipt-and-group-dependencies", dependencies,
         "      const value = read();",
         '      const value = read();\n      if (/^(lookupReceipt|committedGroup|committedGroupById):/.test(key)) return value;',
         r"strict fallback for (lookupReceipt|committedGroup|committedGroupById) at (entry|mid|final)"),
        ("M3-omit-rule-checked-dependencies", dependencies,
         "      const value = read();",
         '      const value = read();\n      if (key.startsWith("checked:")) return value;',
         r"strict fallback for ruleCheckedGroupIds at (entry|mid|final)"),
        ("M4-trust-unreadable-inputs", dependencies,
         "    } catch {\n      this.release();\n      return false;\n    }",
         "    } catch {\n      return true;\n    }",
         r"refuses (index|journal|unreadable-journal) historical replay at (entry|mid|final)"),
        ("M5-skip-immediate-strict-fallback", campaign,
         "          : this.verify();",
         "          : proof?.violations ?? [];",
         r"refuses (index|journal|unreadable-journal) historical replay at (entry|mid)"),
        ("M6-omit-final-authentication", campaign,
         "        proof &&\n        !withCheckpointHistoryReadCache(this.store, () => proof.dependencies.unchanged())",
         "        false",
         r"withholds output after a same-head change|strict fallback for .* at final|refuses .* historical replay at final"),
    ]
    report = {
        "scope": "MECHANISM ONLY; locally specified weakening classes, not unseen reviewer patch bytes",
        "head": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip(),
        "node": subprocess.check_output(["node", "--version"], text=True).strip(),
        "pnpm": subprocess.check_output(["pnpm", "--version"], text=True).strip(),
        "test_sha256": sha(test.read_bytes()),
        "runtime_sha256": {str(p.relative_to(repo)): sha(data) for p, data in originals.items()},
        "runs": [],
    }

    def run(name, pattern=None):
        target = output / (name + ".json")
        command = ["pnpm", "exec", "vitest", "run", str(test.relative_to(repo)),
                   "--reporter=json", "--outputFile=" + str(target)]
        if pattern:
            command += ["--testNamePattern", pattern]
        with (output / (name + ".log")).open("w") as log:
            result = subprocess.run(command, cwd=repo, stdout=log, stderr=subprocess.STDOUT,
                                    timeout=180, env=os.environ.copy())
        data = json.loads(target.read_text())
        assertions = [a for t in data["testResults"] for a in t["assertionResults"]]
        selected = [a for a in assertions if not pattern or re.search(pattern, a["fullName"])]
        assertion_failure = re.compile(
            r"^(AssertionError:|Error: expected \[Function\] to throw|Error: promise resolved)"
        )
        return {
            "name": name, "command": command, "exit": result.returncode,
            "selected": len(selected),
            "passed": [a["fullName"] for a in selected if a["status"] == "passed"],
            "failed": [a["fullName"] for a in selected if a["status"] == "failed"],
            "assertion_failures": [a["fullName"] for a in selected if a["status"] == "failed"
                                   and any(assertion_failure.search(m)
                                           and "read-verification.test.ts:" in m
                                           for m in a.get("failureMessages", []))],
            "failures": {a["fullName"]: a.get("failureMessages", [])
                         for a in selected if a["status"] == "failed"},
            "numFailedTests": data["numFailedTests"],
            "report_sha256": sha(target.read_bytes()),
        }

    try:
        control = run("control-before")
        report["runs"].append(control)
        if control["exit"] != 0 or control["failed"] or not control["passed"]:
            raise RuntimeError("unmutated control failed")
        print("control-before PASS (" + str(len(control["passed"])) + " tests)", flush=True)
        for name, path, before, after, pattern in variants:
            source = originals[path].decode()
            if source.count(before) != 1:
                raise RuntimeError("mutation did not match exactly once: " + name)
            try:
                path.write_text(source.replace(before, after))
                item = run(name, pattern)
                item.update({"file": str(path.relative_to(repo)), "before": before, "after": after,
                             "mutated_sha256": sha(path.read_bytes())})
                report["runs"].append(item)
                if (item["exit"] != 1 or not item["failed"] or item["numFailedTests"] == 0
                        or item["failed"] != item["assertion_failures"]):
                    raise RuntimeError("SURVIVED or non-test failure: " + name)
                print(name + " KILLED (" + str(len(item["failed"])) + " named regressions)", flush=True)
            finally:
                path.write_bytes(originals[path])
        control = run("control-after")
        report["runs"].append(control)
        if control["exit"] != 0 or control["failed"] or not control["passed"]:
            raise RuntimeError("restored control failed")
        report["success"] = True
        print("control-after PASS (" + str(len(control["passed"])) + " tests)", flush=True)
    finally:
        for path, data in originals.items():
            path.write_bytes(data)
        report["runtime_restored"] = all(p.read_bytes() == b for p, b in originals.items())
        (output / "summary.json").write_text(json.dumps(report, indent=2) + "\n")
        print("evidence: " + str(output / "summary.json"), flush=True)


if __name__ == "__main__":
    main()
