"""运行时路径管理：兼容 PyInstaller 打包（exe）与源码运行。

- 数据目录（config.yaml / uploads / undo_log.json）：
  打包后 = exe 所在目录（数据持久化在 exe 旁边）；源码运行 = 项目根目录
- 静态资源目录（static/）：
  打包后 = PyInstaller 解包临时目录 _MEIPASS；源码运行 = 项目根目录
"""
import sys
from pathlib import Path


def is_frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def data_dir() -> Path:
    if is_frozen():
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def static_dir() -> Path:
    bundle = Path(getattr(sys, "_MEIPASS", data_dir()))
    return bundle / "static"
