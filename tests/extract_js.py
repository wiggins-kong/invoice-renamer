import re
from pathlib import Path

html = Path("static/index.html", encoding="utf-8").read_text()
script = re.search(r"<script>(.*?)</script>", html, re.S).group(1)
Path(r"C:/Users/wiggins/AppData/Local/Temp/invtest/app_ui.js").write_text(script, encoding="utf-8")
print("JS extracted,", len(script), "chars")
