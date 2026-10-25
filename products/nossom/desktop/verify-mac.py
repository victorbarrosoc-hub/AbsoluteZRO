"""Run on macOS: validate every nested signature and smoke-test the native app."""
import pathlib
import platform
import subprocess
import sys
import time

app = pathlib.Path(sys.argv[1]).resolve()
inspect = '--inspect' in sys.argv
result = subprocess.run(
    ['codesign', '--verify', '--deep', '--strict', '--verbose=2', str(app)],
    capture_output=True, text=True,
)
message = (result.stdout + result.stderr).strip()
print(message, flush=True)
if inspect:
    escaped = message.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
    print(f'::notice title=Previous Mac signature (exit {result.returncode})::{escaped}')
    sys.exit(0)
if result.returncode:
    sys.exit(result.returncode)

# Launch only the runner's native architecture. Signature verification covers
# both targets; a cross-architecture launch would depend on Rosetta availability.
binary = app / 'Contents/MacOS/NOSSOM'
architectures = subprocess.check_output(['lipo', '-archs', str(binary)], text=True)
if platform.machine() not in architectures.split():
    print('Cross-architecture bundle: signature verified; native launch skipped.')
    sys.exit(0)
with open('/tmp/nossom-launch.log', 'w+') as log:
    process = subprocess.Popen([str(binary)], stdout=log, stderr=log)
    try:
        time.sleep(8)
        if process.poll() is not None:
            log.seek(0)
            print(log.read())
            raise SystemExit(f'App exited during native launch: {process.returncode}')
        print('Native application remained running for 8 seconds.')
    finally:
        if process.poll() is None:
            process.terminate()
            process.wait(timeout=15)
