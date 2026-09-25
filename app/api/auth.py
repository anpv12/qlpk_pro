from flask import Blueprint, request, jsonify
from app.models.user import User, UserGroup, UserRole
from app.models.group import Group
from app.core.database import get_db
from app.services.auth import authenticate_user, create_access_token, get_password_hash
from app.schemas.user import UserCreate, UserLogin
from datetime import datetime, timedelta
import jwt
from functools import wraps
import json

import logging

logger = logging.getLogger(__name__)

router = Blueprint('auth', __name__, url_prefix='/auth')
check_router = Blueprint('check', __name__, url_prefix='/check')

# JWT Configuration
from app.core.config import settings

SECRET_KEY = settings.SECRET_KEY
ALGORITHM = settings.ALGORITHM
ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES

ALL_PERMISSIONS = [
    "dashboard", "lichhen", "qlkham-letan", "qlkham-bs", "qlkham-tamly", "qlkham-cls",
    "hoadon", "chi-tieu", "thongke-thuoc", "ql-kho-thuoc", "ql-taikhoan", "ql-thuoc", "ql-phanquyen", "ql-nhomquyen",
    "ql-danhmuc-dichvu", "ql-danhmuc-thuoc", "ql-dichvu", "ql-goi-dichvu",
    "ql-mau-khaosat", "ql-danhmuc-icd", "ql-tu-viettat", "ql-ngayle",
    "ql-tuong-tac-thuoc", "ql-hoat-chat", "ql-di-nguyen", "ql-tailieu",
    "ca-nhan", "ca-nhan-phimtat"
]

def get_current_user(token: str):
    """
    Decodes a JWT token and retrieves the corresponding user from the database.
    Manages its own database session.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            return None
    except jwt.PyJWTError:
        # Token is invalid (e.g., expired, tampered)
        return None
    
    db = next(get_db()) # Get a new database session
    try:
        user = db.query(User).filter(User.username == username).first()
        return user
    finally:
        db.close() # Ensure the database session is closed

def require_auth(f):
    """
    Decorator to protect routes, ensuring a valid JWT token is provided.
    Passes the authenticated user object as the first argument to the decorated function.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({'detail': 'Not authenticated: Missing or malformed Authorization header'}), 401, {'Content-Type': 'application/json; charset=utf-8'}
        
        token = auth_header.split(' ')[1]
        user = get_current_user(token)
        if not user:
            return jsonify({'detail': 'Invalid or expired token'}), 401, {'Content-Type': 'application/json; charset=utf-8'}
        
        # Update last_login for online tracking
        try:
            from datetime import timezone as tz
            db = next(get_db())
            db.query(User).filter(User.id == user.id).update(
                {'last_login': datetime.now(tz.utc)})
            db.commit()
            db.close()
        except Exception:
            pass

        # Pass the user object to the decorated function
        return f(user, *args, **kwargs)
    return decorated_function

def require_admin(f):
    """
    Decorator to protect routes, ensuring a valid JWT token is provided
    and the authenticated user has an 'admin' role.
    Passes the authenticated user object as the first argument to the decorated function.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({'detail': 'Not authenticated: Missing or malformed Authorization header'}), 401, {'Content-Type': 'application/json; charset=utf-8'}
        
        token = auth_header.split(' ')[1]
        user = get_current_user(token)
        if not user:
            return jsonify({'detail': 'Invalid or expired token'}), 401, {'Content-Type': 'application/json; charset=utf-8'}
        
        if user.role != 'admin':
            return jsonify({'detail': 'Admin access required'}), 403, {'Content-Type': 'application/json; charset=utf-8'}
        
        # Pass the user object to the decorated function
        return f(user, *args, **kwargs)
    return decorated_function

@router.route('/login', methods=['POST'])
def login(): # Corrected function name from 'cllogin' to 'login'
    """
    Handles user login, authenticates credentials, and issues a JWT access token.
    Retrieves and returns user-specific permissions based on roles and groups.
    """
    db = next(get_db())
    try:
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
            
        if not username or not password:
            return jsonify({'detail': 'Username and password required'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
            
        user = authenticate_user(db, username, password)
        if not user:
            return jsonify({'detail': 'Invalid credentials'}), 401, {'Content-Type': 'application/json; charset=utf-8'}
            
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user.username}, expires_delta=access_token_expires
        )

        # Update last_login
        from datetime import timezone as tz
        user.last_login = datetime.now(tz.utc)
        db.commit()

        # Lấy danh sách quyền của user
        if user.role == UserRole.ADMIN:
            user_permissions = ALL_PERMISSIONS
            logger.info(f"User {user.id} ({user.username}) is ADMIN - granted all permissions")
        else:
            groups = db.query(Group).join(UserGroup).filter(UserGroup.user_id == user.id).all()
            logger.info(f"User {user.id} ({user.username}, role: {user.role}) has {len(groups)} groups")
            
            if len(groups) == 0:
                logger.warning(f"User {user.id} ({user.username}, role: {user.role}) has NO groups assigned - permissions will be empty!")
            
            user_permissions = []
            for group in groups:
                logger.info(f"  - Group: {group.name} (id: {group.id}), permissions: {group.permissions}")
                if group.permissions:
                    try:
                        # Ensure permissions are loaded correctly from JSON string
                        # Assuming group.permissions stores a JSON string like '["perm1", "perm2"]'
                        group_perms = json.loads(group.permissions)
                        if isinstance(group_perms, list):
                            user_permissions.extend(group_perms)
                            logger.info(f"    Added {len(group_perms)} permissions: {group_perms}")
                        else:
                            logger.error(f"Warning: Group {group.name} has malformed permissions (not a list): {group.permissions}")
                    except json.JSONDecodeError as e:
                        logger.error(f"Warning: Could not decode permissions for group {group.name}: {e}")
                    except Exception as e:
                        logger.error(f"Unexpected error processing permissions for group {group.name}: {e}")
                else:
                    logger.warning(f"    Group {group.name} has no permissions field")
            user_permissions = list(set(user_permissions))  # Remove duplicates
            logger.info(f"Final permissions for user {user.id}: {user_permissions}")
            
        return jsonify({
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": user.id,
                "username": user.username,
                "full_name": user.full_name,
                "email": user.email,
                "role": user.role,
                "permissions": user_permissions # Return the resolved permissions
            }
        }), 200, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        logger.error(f"Login error: {e}")
        return jsonify({'detail': 'Internal server error'}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()

@router.route('/register', methods=['POST'])
@require_admin
def register(user):
    """
    Registers a new user.
    """
    db = next(get_db())
    try:
        data = request.get_json()
        
        # Validate input data using Pydantic schema
        try:
            user_data = UserCreate(**data)
        except Exception as e:
            # Catch Pydantic validation errors and return a 400
            return jsonify({'detail': f'Invalid input data: {e.errors() if hasattr(e, "errors") else str(e)}'}), 400, {'Content-Type': 'application/json; charset=utf-8'}
        
        # Check if user already exists by username or email
        existing_user = db.query(User).filter(
            (User.username == user_data.username) | (User.email == user_data.email)
        ).first()
        
        if existing_user:
            # Return 409 Conflict if username or email already exists
            return jsonify({'detail': 'Username or email already registered'}), 409, {'Content-Type': 'application/json; charset=utf-8'}
        
        # Create new user
        hashed_password = get_password_hash(user_data.password)
        db_user = User(
            username=user_data.username,
            email=user_data.email,
            full_name=user_data.full_name,
            hashed_password=hashed_password,
            # Set role; default to 'user' if not provided or invalid
            role=user_data.role if user_data.role in ['admin', 'doctor', 'staff', 'user'] else 'user'
        )
        
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        
        return jsonify({
            "id": db_user.id,
            "username": db_user.username,
            "email": db_user.email,
            "full_name": db_user.full_name,
            "role": db_user.role
        }), 201, {'Content-Type': 'application/json; charset=utf-8'} # 201 Created
    except Exception as e:
        db.rollback() # Rollback changes in case of an error
        logger.error(f"Registration error: {e}")
        return jsonify({'detail': 'Internal server error'}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()

@check_router.route('/me', methods=['GET'])
@require_auth
def get_current_user_info(user: User):
    """
    Returns information about the currently authenticated user.
    The 'user' object is passed directly from the require_auth decorator.
    """
    db = next(get_db())
    try:
        # Re-fetch user to ensure relationships (like groups) are loaded
        # or load permissions directly if not eagerly loaded
        # Re-querying here is okay if user object from decorator is detached
        user_with_groups = db.query(User).filter(User.id == user.id).first()

        user_permissions = []
        if user_with_groups:
            if user_with_groups.role == UserRole.ADMIN:
                user_permissions = ALL_PERMISSIONS
                logger.info(f"User {user.id} ({user.username}) is ADMIN - granted all permissions")
            else:
                # Fix: Use 'groups' instead of 'user_groups' to match the User model
                groups = user_with_groups.groups # Access the relationship
                logger.info(f"User {user.id} ({user.username}, role: {user_with_groups.role}) has {len(groups)} groups")
                
                if len(groups) == 0:
                    logger.warning(f"User {user.id} ({user.username}, role: {user_with_groups.role}) has NO groups assigned - permissions will be empty!")
                
                for user_group_assoc in groups:
                    group = user_group_assoc.group # Get the Group object
                    logger.info(f"  - Group: {group.name if group else 'None'} (id: {group.id if group else 'N/A'}), permissions: {group.permissions if group else 'None'}")
                    if group and group.permissions:
                        try:
                            group_perms = json.loads(group.permissions)
                            if isinstance(group_perms, list):
                                user_permissions.extend(group_perms)
                                logger.info(f"    Added {len(group_perms)} permissions: {group_perms}")
                        except json.JSONDecodeError as e:
                            logger.error(f"Warning: Could not decode permissions for group {group.name}: {e}")
                    elif group:
                        logger.warning(f"    Group {group.name} has no permissions field")
                user_permissions = list(set(user_permissions)) # Remove duplicates
                logger.info(f"Final permissions for user {user.id}: {user_permissions}")

        return jsonify({
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role,
            "permissions": user_permissions # Include permissions here too
        }), 200, {'Content-Type': 'application/json; charset=utf-8'}
    except Exception as e:
        logger.error(f"Error getting user info: {e}")
        return jsonify({'detail': 'Internal server error'}), 500, {'Content-Type': 'application/json; charset=utf-8'}
    finally:
        db.close()


@check_router.route('/admin-status', methods=['GET'])
@require_admin
def check_admin_status(user: User):
    """
    An example endpoint that only administrators can access.
    The 'user' object is passed directly from the require_admin decorator.
    """
    return jsonify({
        "message": f"Welcome, admin {user.username}! You have administrative privileges.",
        "user_id": user.id,
        "user_role": user.role
    }), 200, {'Content-Type': 'application/json; charset=utf-8'}
