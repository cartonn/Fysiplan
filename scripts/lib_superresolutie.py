"""AI-superresolutie voor kleine lijntekeningen: Real-ESRGAN (x4, anime_6B).

Real-ESRGAN (Wang et al., ICCVW 2021) is getraind om tekeningen met harde
lijnen te vergroten zonder de typische waas en trapjes van bicubisch
opschalen. Het 'anime_6B'-model is klein (6 RRDB-blokken, 18 MB) en bedoeld
voor illustraties met lijnwerk. Gewichten: release v0.2.2.4 van
github.com/xinntao/Real-ESRGAN. Vereist torch (CPU volstaat).
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

MODEL_URL = "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.2.4/RealESRGAN_x4plus_anime_6B.pth"
_model = None


def available() -> bool:
    try:
        import torch  # noqa: F401
        return True
    except ImportError:
        return False


def _build(cache: Path):
    import torch
    from torch import nn
    from torch.nn import functional as F

    class RDB(nn.Module):
        def __init__(self, nf=64, gc=32):
            super().__init__()
            self.conv1 = nn.Conv2d(nf, gc, 3, 1, 1)
            self.conv2 = nn.Conv2d(nf + gc, gc, 3, 1, 1)
            self.conv3 = nn.Conv2d(nf + 2 * gc, gc, 3, 1, 1)
            self.conv4 = nn.Conv2d(nf + 3 * gc, gc, 3, 1, 1)
            self.conv5 = nn.Conv2d(nf + 4 * gc, nf, 3, 1, 1)
            self.lrelu = nn.LeakyReLU(0.2, True)

        def forward(self, x):
            x1 = self.lrelu(self.conv1(x))
            x2 = self.lrelu(self.conv2(torch.cat((x, x1), 1)))
            x3 = self.lrelu(self.conv3(torch.cat((x, x1, x2), 1)))
            x4 = self.lrelu(self.conv4(torch.cat((x, x1, x2, x3), 1)))
            x5 = self.conv5(torch.cat((x, x1, x2, x3, x4), 1))
            return x5 * 0.2 + x

    class RRDB(nn.Module):
        def __init__(self, nf=64, gc=32):
            super().__init__()
            self.rdb1, self.rdb2, self.rdb3 = RDB(nf, gc), RDB(nf, gc), RDB(nf, gc)

        def forward(self, x):
            return self.rdb3(self.rdb2(self.rdb1(x))) * 0.2 + x

    class RRDBNet(nn.Module):
        def __init__(self, nb=6, nf=64, gc=32):
            super().__init__()
            self.conv_first = nn.Conv2d(3, nf, 3, 1, 1)
            self.body = nn.Sequential(*[RRDB(nf, gc) for _ in range(nb)])
            self.conv_body = nn.Conv2d(nf, nf, 3, 1, 1)
            self.conv_up1 = nn.Conv2d(nf, nf, 3, 1, 1)
            self.conv_up2 = nn.Conv2d(nf, nf, 3, 1, 1)
            self.conv_hr = nn.Conv2d(nf, nf, 3, 1, 1)
            self.conv_last = nn.Conv2d(nf, 3, 3, 1, 1)
            self.lrelu = nn.LeakyReLU(0.2, True)

        def forward(self, x):
            feat = self.conv_first(x)
            feat = feat + self.conv_body(self.body(feat))
            feat = self.lrelu(self.conv_up1(F.interpolate(feat, scale_factor=2, mode="nearest")))
            feat = self.lrelu(self.conv_up2(F.interpolate(feat, scale_factor=2, mode="nearest")))
            return self.conv_last(self.lrelu(self.conv_hr(feat)))

    path = cache / "RealESRGAN_x4plus_anime_6B.pth"
    if not path.exists() or path.stat().st_size < 1_000_000:
        import urllib.request
        cache.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".part")
        urllib.request.urlretrieve(MODEL_URL, tmp)
        tmp.replace(path)
    state = torch.load(path, map_location="cpu", weights_only=True)
    state = state.get("params_ema", state.get("params", state))
    net = RRDBNet()
    net.load_state_dict(state, strict=True)
    net.eval()
    torch.set_num_threads(1)
    return net


def upscale4(gray: np.ndarray, cache: Path) -> np.ndarray:
    """gray: uint8 HxW -> float32 (4H x 4W) in [0, 1]. Resultaten worden per
    bron (sha256) bewaard in cache/sr/, want de AI-stap is het trage deel."""
    import hashlib
    import cv2
    key = hashlib.sha256(gray.tobytes() + str(gray.shape).encode()).hexdigest()[:24]
    stored = cache / "sr" / f"{key}.png"
    if stored.exists():
        return cv2.imread(str(stored), cv2.IMREAD_GRAYSCALE).astype(np.float32) / 255
    result = _upscale4(gray, cache)
    stored.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(stored), np.round(result * 255).astype(np.uint8))
    return result


def _upscale4(gray: np.ndarray, cache: Path) -> np.ndarray:
    import torch
    global _model
    if _model is None:
        _model = _build(cache)
    x = np.repeat(gray[None, None].astype(np.float32) / 255, 3, axis=1)
    with torch.no_grad():
        y = _model(torch.from_numpy(x)).clamp(0, 1).numpy()
    return y[0].mean(axis=0)
