#!/usr/bin/env python3
"""Apply a set of exact-once text edits (JSON spec), run the given vitest files, record the verdict, ALWAYS restore every file by hash.
usage (from the repository root): python3 -I docs/evidence/f014b-b2/mutate.py <spec.json>
spec = {"id","description","edits":[{"file","old","new"}],"tests":[...]}
The vitest JSON report is written under $B2_MUTATION_OUT (default /tmp/b2-mutation)."""
import hashlib, json, subprocess, sys, shutil, os, time
spec = json.load(open(sys.argv[1]))
repo = os.getcwd()
out_dir = os.environ.get("B2_MUTATION_OUT", "/tmp/b2-mutation")
os.makedirs(out_dir, exist_ok=True)
saved = {}
for e in spec["edits"]:
    full = os.path.join(repo, e["file"])
    if e["file"] not in saved:
        saved[e["file"]] = open(full, "rb").read()
    text = saved[e["file"]].decode()
    if text.count(e["old"]) != 1:
        print(json.dumps({"id": spec["id"], "error": f"old text occurs {text.count(e['old'])} times in {e['file']}"})); sys.exit(2)
t0 = time.time()
try:
    work = {f: b.decode() for f, b in saved.items()}
    for e in spec["edits"]:
        work[e["file"]] = work[e["file"]].replace(e["old"], e["new"], 1)
    for f, t in work.items():
        open(os.path.join(repo, f), "w").write(t)
    outfile = os.path.join(out_dir, f"mut-out-{spec['id']}.json")
    if os.path.exists(outfile): os.remove(outfile)
    r = subprocess.run(["pnpm", "exec", "vitest", "run", "--reporter=json", f"--outputFile={outfile}", *spec["tests"]], cwd=repo, capture_output=True, text=True, timeout=1500)
    try:
        j = json.load(open(outfile))
        failed = [f"{tf['name'].split('/tests/')[-1]} :: {a['title']}" for tf in j["testResults"] for a in tf["assertionResults"] if a["status"] == "failed"]
        failed_files = sorted({tf["name"].split("/tests/")[-1] for tf in j["testResults"] if tf["status"] == "failed"})
        total = j["numTotalTests"]; passed = j["numPassedTests"]
    except Exception as ex:
        failed, failed_files, total, passed = [f"UNPARSEABLE: {ex}"], [], -1, -1
    verdict = {"id": spec["id"], "description": spec["description"], "killed": len(failed) > 0, "failed_count": len(failed), "total": total, "passed": passed, "failed_files": failed_files, "first_failures": failed[:5], "seconds": round(time.time()-t0, 1)}
finally:
    for f, b in saved.items():
        open(os.path.join(repo, f), "wb").write(b)
        assert hashlib.sha256(open(os.path.join(repo, f), "rb").read()).hexdigest() == hashlib.sha256(b).hexdigest(), "RESTORE FAILED " + f
print(json.dumps(verdict))
