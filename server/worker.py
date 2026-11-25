"""Run or sweep Pixelbench's private ComfyUI instances (Windows and macOS)."""
import os
from pathlib import Path
import re
import shutil
import stat
import sys
import threading

if os.name == "nt":
    import msvcrt

    def lock(lease):
        msvcrt.locking(lease.fileno(), msvcrt.LK_NBLCK, 1)

    def is_link(directory):
        return bool(directory.lstat().st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT)

else:
    import fcntl

    def lock(lease):
        # Raises BlockingIOError (an OSError) while a running worker holds the lease.
        fcntl.flock(lease.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)

    def is_link(directory):
        return stat.S_ISLNK(directory.lstat().st_mode)


def sweep(root, current):
    for directory in Path(root).glob("worker-*"):
        if directory == Path(current):
            continue
        if not re.fullmatch(r"worker-[0-9a-f-]{36}", directory.name):
            continue
        if is_link(directory):
            continue
        try:
            marker = directory / ".pixelbench"
            signature = b"Pixelbench worker v1"
            with marker.open("r+b") as lease:
                lock(lease)
                if lease.read() != signature:
                    continue
            # This directory is never reused by a future worker.
            shutil.rmtree(directory)
        except (FileNotFoundError, PermissionError, OSError):
            continue


if sys.argv[1] == "sweep":
    sweep(sys.argv[2], sys.argv[3])
    sys.exit(0)

source, root = map(Path, sys.argv[1:3])
lease = (root / ".pixelbench").open("r+b")
lock(lease)
secret = os.environ.pop("PIXELBENCH_WORKER_TOKEN")


def die_with_bridge():
    # The pipe closes on bridge exit, including an unhandled crash or Task Manager kill.
    os.read(0, 1)
    os._exit(0)


sys.path.insert(0, str(source))
sys.path.append(str(root.parent / "python"))
sys.argv = [str(source / "main.py"), *sys.argv[3:]]

import main
from aiohttp import web
from secrets import compare_digest


@web.middleware
async def authenticate(request, handler):
    token = request.headers.get("X-Pixelbench", "")
    if request.path == "/ws":
        token = request.query.get("token", "")
    if not compare_digest(token.encode(), secret.encode()):
        return web.Response(status=403)
    return await handler(request)


original_init = main.server.PromptServer.__init__


def init(server, *args, **kwargs):
    original_init(server, *args, **kwargs)
    server.app.middlewares.insert(0, authenticate)


main.server.PromptServer.__init__ = init
threading.Thread(target=die_with_bridge, daemon=True).start()
loop, server, start = main.start_comfyui()
loop.run_until_complete(start())



