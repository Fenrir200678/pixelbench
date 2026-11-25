"""Reports what Pixelbench needs to know about a ComfyUI Python environment as one JSON line.

Usage: python -I -B probe.py <extra package dir> <requirements as JSON list>
"""

import json
import sys
from importlib import metadata

extra = sys.argv[1]
requirements = json.loads(sys.argv[2])
# The bridge appends the same folder in worker.py, so packages installed there count as present.
sys.path.append(extra)


try:
    from packaging.requirements import Requirement
except ImportError:
    try:
        from pip._vendor.packaging.requirements import Requirement
    except ImportError:
        Requirement = None


def satisfied(text):
    if Requirement is None:
        name = text.split(";")[0].strip()
        for sign in "<>=!~ [":
            name = name.split(sign)[0]
        spec = None
    else:
        parsed = Requirement(text)
        name, spec = parsed.name, parsed.specifier
    found = next(metadata.distributions(name=name, path=sys.path), None)
    if found is None:
        return False
    return spec is None or spec.contains(found.version, prereleases=True)


# "a|b" accepts either distribution, such as opencv-python for opencv-python-headless. The first one is installed.
missing = [r.split("|")[0] for r in requirements if not any(satisfied(option) for option in r.split("|"))]
report = {"python": sys.version.split()[0], "missing": missing}
try:
    import pip  # noqa: F401

    report["pip"] = True
except ImportError:
    report["pip"] = False
try:
    import torch

    report["torch"] = torch.__version__
    report["cuda"] = torch.cuda.is_available()
    if report["cuda"]:
        report["device"] = torch.cuda.get_device_name(0)
        report["vram"] = round(torch.cuda.get_device_properties(0).total_memory / 1024**3, 1)
    else:
        mps = getattr(torch.backends, "mps", None)
        report["mps"] = bool(mps and mps.is_available())
except Exception as error:  # A broken torch install raises more than ImportError.
    report["torchError"] = str(error)
print(json.dumps(report))
