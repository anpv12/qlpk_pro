from io import BytesIO

import pytest
from PIL import Image

from app.utils.image_optimizer import AVATAR_MAX_EDGE, InvalidImageError, optimize_image


def _png_bytes(size, mode='RGB'):
    output = BytesIO()
    Image.new(mode, size, (200, 30, 30) if mode == 'RGB' else (200, 30, 30, 120)).save(output, format='PNG')
    return output.getvalue()


def test_large_photo_is_bounded_and_reencoded_as_jpeg():
    data, ext = optimize_image(_png_bytes((2048, 1365)), 'png')
    image = Image.open(BytesIO(data))
    assert ext == 'jpg'
    assert image.format == 'JPEG'
    assert max(image.size) == AVATAR_MAX_EDGE
    assert len(data) < len(_png_bytes((2048, 1365)))


def test_transparent_png_keeps_alpha_and_format():
    data, ext = optimize_image(_png_bytes((900, 300), 'RGBA'), 'png')
    image = Image.open(BytesIO(data))
    assert ext == 'png'
    assert image.format == 'PNG' and image.mode == 'RGBA'
    assert image.size == (AVATAR_MAX_EDGE, 171)


def test_small_image_is_not_upscaled():
    data, _ = optimize_image(_png_bytes((120, 80)), 'jpg')
    assert Image.open(BytesIO(data)).size == (120, 80)


def test_non_image_bytes_are_rejected():
    with pytest.raises(InvalidImageError):
        optimize_image(b'<html>not an image</html>', 'jpg')
    with pytest.raises(InvalidImageError):
        optimize_image(b'GIF89a-broken', 'gif')
