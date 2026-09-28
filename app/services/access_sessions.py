import hashlib
import math
from functools import lru_cache
from threading import Lock
from time import time
from uuid import uuid4

from redis import Redis

from app.core.config import settings


class SessionStoreUnavailable(RuntimeError):
    pass


class MemorySessionStore:
    def __init__(self, max_entries=10000, clock=time):
        self.entries = {}
        self.max_entries = max_entries
        self.clock = clock
        self.lock = Lock()

    def generation(self, key):
        with self.lock:
            now = self.clock()
            existing = self.entries.get(key)
            if existing and existing[1] <= now:
                del self.entries[key]
            if len(self.entries) >= self.max_entries:
                self.entries = {identity: value for identity, value in self.entries.items() if value[1] > now}
            if key not in self.entries:
                if len(self.entries) >= self.max_entries:
                    raise RuntimeError('Session registration unavailable')
                self.entries[key] = (uuid4().hex, now + 86400)
            return self.entries[key][0]

    def register(self, key, digest, expires, account_key=None, generation=None):
        with self.lock:
            now = self.clock()
            if account_key:
                account = self.entries.get(account_key)
                if not account or account[0] != generation or account[1] <= now:
                    raise RuntimeError('Account session generation changed')
            if len(self.entries) >= self.max_entries:
                self.entries = {identity: value for identity, value in self.entries.items() if value[1] > now}
            if key in self.entries or len(self.entries) >= self.max_entries:
                raise RuntimeError('Session registration unavailable')
            self.entries[key] = (digest, expires)
            if account_key:
                self.entries[account_key] = (generation, max(account[1], expires))

    def active(self, key, digest, account_key=None, generation=None):
        with self.lock:
            if account_key:
                account = self.entries.get(account_key)
                if not account or account[0] != generation or account[1] <= self.clock():
                    return False
            entry = self.entries.get(key)
            if not entry:
                return False
            if entry[1] <= self.clock():
                del self.entries[key]
                return False
            return entry[0] == digest

    def revoke(self, key):
        with self.lock:
            self.entries.pop(key, None)


class RedisSessionStore:
    def __init__(self, url):
        self.client = Redis.from_url(url, decode_responses=True, socket_connect_timeout=1, socket_timeout=1)

    def generation(self, key):
        self.client.set(key, uuid4().hex, ex=86400, nx=True)
        generation = self.client.get(key)
        if not generation:
            raise RuntimeError('Account session generation unavailable')
        return generation

    def register(self, key, digest, expires, account_key=None, generation=None):
        ttl = max(1, math.ceil(expires - time()))
        if account_key:
            registered = self.client.eval('''
                if redis.call('GET', KEYS[2]) ~= ARGV[3] then return 0 end
                if not redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2], 'NX') then return 0 end
                if redis.call('TTL', KEYS[2]) < tonumber(ARGV[2]) then
                    redis.call('EXPIRE', KEYS[2], ARGV[2])
                end
                return 1
            ''', 2, key, account_key, digest, ttl, generation)
            if not registered:
                raise RuntimeError('Session registration unavailable')
            return
        if not self.client.set(key, digest, ex=ttl, nx=True):
            raise RuntimeError('Session registration unavailable')

    def active(self, key, digest, account_key=None, generation=None):
        if account_key:
            return self.client.mget(key, account_key) == [digest, generation]
        return self.client.get(key) == digest

    def revoke(self, key):
        self.client.delete(key)


_memory_store = MemorySessionStore()


@lru_cache(maxsize=2)
def _redis_store(url):
    return RedisSessionStore(url)


def session_store():
    url = settings.SESSION_REDIS_URL or settings.REALTIME_REDIS_URL
    if url:
        return _redis_store(url)
    if not settings.DEBUG:
        raise RuntimeError('Production sessions require a shared Redis store')
    return _memory_store


def session_key(session_id):
    if not isinstance(session_id, str) or len(session_id) != 32 or any(character not in '0123456789abcdef' for character in session_id):
        return None
    return 'qlpk:access-session:' + session_id


def account_session_key(user_id):
    if type(user_id) is not int or user_id <= 0:
        raise ValueError('Invalid account identity')
    return f'qlpk:access-account:{user_id}'


def account_session_generation(user_id):
    try:
        return session_store().generation(account_session_key(user_id))
    except Exception as error:
        raise SessionStoreUnavailable('Account sessions unavailable') from error


def revoke_account_sessions(user_id):
    try:
        session_store().revoke(account_session_key(user_id))
    except Exception as error:
        raise SessionStoreUnavailable('Account session revocation unavailable') from error


def register_session(token, session_id, expires, *, user_id, generation):
    key = session_key(session_id)
    if not key:
        raise ValueError('Invalid session identity')
    try:
        session_store().register(key, hashlib.sha256(token.encode()).hexdigest(), expires,
                                 account_session_key(user_id), generation)
    except Exception as error:
        raise SessionStoreUnavailable('Session registration unavailable') from error


def session_is_active(token, claims):
    return session_digest_is_active(claims.get('jti'), hashlib.sha256(token.encode()).hexdigest(),
                                    user_id=claims.get('session_user_id'),
                                    generation=claims.get('session_generation'))


def session_digest_is_active(session_id, digest, *, user_id, generation):
    key = session_key(session_id)
    if not key or not session_key(generation) or type(user_id) is not int or user_id <= 0 or not isinstance(digest, str):
        return False
    try:
        return bool(session_store().active(key, digest, account_session_key(user_id), generation))
    except Exception as error:
        raise SessionStoreUnavailable('Session validation unavailable') from error


def revoke_session(claims):
    key = session_key(claims.get('jti'))
    if key:
        session_store().revoke(key)
