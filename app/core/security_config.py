from app.core.security_headers import uses_insecure_default_secret


def production_security_errors(config):
    errors = []
    secret = config.SECRET_KEY
    if not isinstance(secret, str) or uses_insecure_default_secret(secret) or len(secret.encode()) < 32:
        errors.append('SECRET_KEY must be a private random value of at least 32 bytes')
    expiry = config.ACCESS_TOKEN_EXPIRE_MINUTES
    if type(expiry) is not int or not 1 <= expiry <= 1440:
        errors.append('ACCESS_TOKEN_EXPIRE_MINUTES must be between 1 and 1440 in production')
    if config.ALGORITHM != 'HS256':
        errors.append('ALGORITHM must be HS256 for the configured symmetric key contract')
    if not (getattr(config, 'SESSION_REDIS_URL', None) or getattr(config, 'REALTIME_REDIS_URL', None)):
        errors.append('SESSION_REDIS_URL or REALTIME_REDIS_URL is required for production sessions')
    return errors


def validate_security_config(config):
    if config.DEBUG:
        return
    errors = production_security_errors(config)
    if errors:
        raise RuntimeError('Unsafe production security configuration: ' + '; '.join(errors))
