"""Run explicit DOM-only adapters; not native persistence or provider evidence."""
import os
import runpy
from pathlib import Path

os.environ['NOVA_DOM_ADAPTERS'] = '1'
runpy.run_path(str(Path(__file__).with_name('browser.smoke.py')), run_name='__main__')
