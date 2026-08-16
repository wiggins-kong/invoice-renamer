"""Windows DPAPI 密钥保护：API key 以密文落盘，仅当前 Windows 用户可解密。

- protect() → "enc:" + base64(CryptProtectData(plain))
- unprotect() → 自动识别 "enc:" 前缀并解密；非加密文本原样返回（兼容旧配置）
- 非 Windows 平台自动降级为明文（本地工具，不影响功能）
"""
import base64
import sys

if sys.platform == "win32":
    import ctypes
    import ctypes.wintypes as wt

    _LocalFree = ctypes.windll.kernel32.LocalFree

    class DATA_BLOB(ctypes.Structure):
        _fields_ = [("cbData", wt.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]

    def _to_blob(data: bytes) -> DATA_BLOB:
        buf = ctypes.create_string_buffer(data, len(data))
        return DATA_BLOB(len(data), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char)))

    def _from_blob(blob: DATA_BLOB) -> bytes:
        try:
            return ctypes.string_at(blob.pbData, blob.cbData)
        finally:
            if blob.pbData:
                _LocalFree(blob.pbData)

    def _protect(plain: str) -> str:
        out = DATA_BLOB()
        ok = ctypes.windll.crypt32.CryptProtectData(
            ctypes.byref(_to_blob(plain.encode("utf-8"))),
            "invoice-renamer", None, None, None, 0, ctypes.byref(out),
        )
        if not ok:
            raise ctypes.WinError()
        return base64.b64encode(_from_blob(out)).decode("ascii")

    def _unprotect(blob_b64: str) -> str:
        out = DATA_BLOB()
        raw = base64.b64decode(blob_b64)
        ok = ctypes.windll.crypt32.CryptUnprotectData(
            ctypes.byref(_to_blob(raw)),
            None, None, None, None, 0, ctypes.byref(out),
        )
        if not ok:
            raise ctypes.WinError()
        return _from_blob(out).decode("utf-8")

else:

    def _protect(plain: str) -> str:
        return plain

    def _unprotect(blob_b64: str) -> str:
        return blob_b64


PREFIX = "enc:"


def protect(plain: str) -> str:
    """加密明文，返回可写入配置文件的字符串。"""
    if not plain:
        return ""
    return PREFIX + _protect(plain)


def unprotect(token: str) -> str:
    """解密配置中的密文；非加密内容原样返回。"""
    if not token:
        return ""
    if not token.startswith(PREFIX):
        return token
    return _unprotect(token[len(PREFIX):])


def mask(plain: str) -> str:
    """脱敏展示：sk-****abcd。"""
    if not plain:
        return ""
    if len(plain) <= 8:
        return plain[0] + "****"
    return f"{plain[:3]}****{plain[-4:]}"
