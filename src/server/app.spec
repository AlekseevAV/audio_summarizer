# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['app.py'],
    pathex=['./'],
    binaries=[
        ('.venv/lib/python3.12/site-packages/mlx/lib/mlx.metallib', 'mlx'),
        ('.venv/lib/python3.12/site-packages/mlx/lib/libmlx.dylib', 'mlx')
    ],
    datas=[
        ('.venv/lib/python3.12/site-packages/mlx', './mlx'),
        ('assets', 'assets'),
        ('prompts', 'prompts'),
        ('mel_filters.npz', '.'),
    ],
    hiddenimports=['mlx', 'mlx._reprlib_fix', 'mlx._os_warning'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='app',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
app = BUNDLE(
    exe,
    name='Audio Summarizer.app',
    icon='assets/icon.icns',
    bundle_identifier=None,
)
