"""Resize and re-encode uploaded raster images before they are stored.

Avatars are rendered at most a few hundred pixels wide, yet users upload camera
photos of several megabytes; every page then downloads them through the app
header. ``optimize_image`` bounds the longest edge, strips EXIF orientation
into real pixels and re-encodes with a sane quality. Animated GIFs are kept as
uploaded so they keep animating.
"""

from io import BytesIO

from PIL import Image, ImageOps, UnidentifiedImageError

AVATAR_MAX_EDGE = 512
JPEG_QUALITY = 85
FORMAT_BY_EXT = {'jpg': 'JPEG', 'jpeg': 'JPEG', 'png': 'PNG', 'gif': 'GIF', 'webp': 'WEBP'}


class InvalidImageError(ValueError):
    """Raised when the uploaded bytes are not a decodable raster image."""


def optimize_image(data, ext, max_edge=AVATAR_MAX_EDGE, quality=JPEG_QUALITY, keep_format=False):
    """Return ``(bytes, ext)`` for the bounded, re-encoded image.

    ``ext`` is the lower-case extension the caller validated. GIF files are
    returned untouched. Any other format is decoded with Pillow; PNG keeps its
    alpha channel, everything else becomes a JPEG. ``keep_format`` keeps PNG
    output for PNG input so an existing file can be rewritten under its name.
    """
    ext = (ext or '').lower()
    if ext == 'gif':
        _assert_decodable(data)
        return data, ext
    try:
        image = Image.open(BytesIO(data))
        image.load()
    except (UnidentifiedImageError, OSError) as error:
        raise InvalidImageError('Tệp không phải ảnh hợp lệ') from error
    image = ImageOps.exif_transpose(image)
    image.thumbnail((max_edge, max_edge), Image.LANCZOS)
    output = BytesIO()
    if ext == 'png' and (keep_format or image.mode in ('RGBA', 'LA', 'P')):
        image.save(output, format='PNG', optimize=True)
        return output.getvalue(), 'png'
    if image.mode != 'RGB':
        image = image.convert('RGB')
    image.save(output, format='JPEG', quality=quality, optimize=True, progressive=True)
    return output.getvalue(), 'jpg'


def _assert_decodable(data):
    try:
        Image.open(BytesIO(data)).verify()
    except (UnidentifiedImageError, OSError) as error:
        raise InvalidImageError('Tệp không phải ảnh hợp lệ') from error
