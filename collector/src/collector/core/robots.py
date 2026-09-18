"""robots.txt compliance check. Every source module must call this before
its first fetch of a given domain.
"""

from __future__ import annotations

from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import httpx


def check_allowed(url: str, user_agent: str, client: httpx.Client) -> bool:
    """Returns True if `url` may be fetched by `user_agent` per robots.txt.

    A missing or unreachable robots.txt is treated as allowed, matching the
    convention robots.txt itself is built on.
    """
    parsed = urlparse(url)
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"

    parser = RobotFileParser()
    try:
        response = client.get(robots_url, timeout=10)
    except httpx.HTTPError:
        return True
    if response.status_code >= 400:
        return True

    parser.parse(response.text.splitlines())
    return parser.can_fetch(user_agent, url)
