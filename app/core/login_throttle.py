import hashlib
import hmac
import math
from functools import lru_cache, wraps
from threading import Lock
from time import monotonic

from flask import jsonify, request
from redis import Redis

from app.core.config import settings


REDIS_RESERVE = """
local retry = 0
for index, key in ipairs(KEYS) do
    local count = tonumber(redis.call('GET', key) or '0')
    if count >= tonumber(ARGV[index + 1]) then
        local ttl = redis.call('PTTL', key)
        if ttl < 0 then
            ttl = tonumber(ARGV[1])
            redis.call('PEXPIRE', key, ttl)
        end
        retry = math.max(retry, ttl)
    end
end
if retry > 0 then return retry end
for index, key in ipairs(KEYS) do
    local count = redis.call('INCR', key)
    if count == 1 then redis.call('PEXPIRE', key, ARGV[1]) end
end
return 0
"""


class MemoryLoginThrottle:
    def __init__(self, max_keys=10000, clock=monotonic):
        self.entries = {}
        self.max_keys = max_keys
        self.clock = clock
        self.lock = Lock()

    def reserve(self, budgets, window_seconds):
        with self.lock:
            now = self.clock()
            for key, _ in budgets:
                if key in self.entries and self.entries[key][1] <= now:
                    del self.entries[key]
            waits = [self.entries[key][1] - now for key, limit in budgets
                     if key in self.entries and self.entries[key][0] >= limit]
            if waits:
                return max(1, math.ceil(max(waits)))
            new_keys = {key for key, _ in budgets if key not in self.entries}
            if len(self.entries) + len(new_keys) > self.max_keys:
                self.entries = {key: value for key, value in self.entries.items() if value[1] > now}
                if len(self.entries) + len(new_keys) > self.max_keys:
                    expires = min((value[1] for value in self.entries.values()), default=now + window_seconds)
                    return max(1, math.ceil(expires - now))
            for key, _ in budgets:
                count, expires = self.entries.get(key, (0, now + window_seconds))
                self.entries[key] = (count + 1, expires)
            return 0


_memory_store = MemoryLoginThrottle()


@lru_cache(maxsize=2)
def _redis_store(url):
    return Redis.from_url(url, socket_connect_timeout=1, socket_timeout=1,
                          decode_responses=True)


def _budget_key(kind, identity):
    digest = hmac.new(settings.SECRET_KEY.encode(), identity.encode(), hashlib.sha256).hexdigest()
    return f'qlpk:login:{{login}}:{kind}:{digest}'


def reserve_login_attempt(username, address):
    budgets = [(_budget_key('ip', address or 'unknown'), settings.LOGIN_IP_ATTEMPTS)]
    if isinstance(username, str) and username.strip():
        budgets.append((_budget_key('account', username.strip().casefold()), settings.LOGIN_ACCOUNT_ATTEMPTS))
    window = settings.LOGIN_WINDOW_SECONDS
    url = settings.LOGIN_REDIS_URL or settings.REALTIME_REDIS_URL
    if url:
        milliseconds = _redis_store(url).eval(REDIS_RESERVE, len(budgets),
            *(key for key, _ in budgets), window * 1000, *(limit for _, limit in budgets))
        return max(0, math.ceil(int(milliseconds) / 1000))
    return _memory_store.reserve(budgets, window)


def limit_login_attempts(handler):
    @wraps(handler)
    def limited(*args, **kwargs):
        data = request.get_json(silent=True)
        username = data.get('username') if isinstance(data, dict) else None
        try:
            retry_after = reserve_login_attempt(username, request.remote_addr)
        except Exception:
            return jsonify(code='system.unavailable', detail='Tạm thời không thể đăng nhập.'), 503, {'Retry-After': '5'}
        if retry_after:
            return jsonify(code='request.rate_limited', detail='Vui lòng chờ trước khi thử đăng nhập lại.',
                           retry_after=retry_after), 429, {'Retry-After': str(retry_after)}
        return handler(*args, **kwargs)
    return limited
