import os
import pickle
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
from google.auth.transport.requests import Request
import io
import logging

logger = logging.getLogger(__name__)

class DriveService:
    def __init__(self):
        self.creds = None
        self.service = None
        self.token_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'token_drive.json')
        self.credentials_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'credentials.json')
        self._authenticate()

    def _authenticate(self):
        """Khởi tạo service và load token từ file token_drive.json"""
        if os.path.exists(self.token_path):
            with open(self.token_path, 'rb') as token:
                self.creds = pickle.load(token)

        # Refresh token nếu hết hạn
        if self.creds and self.creds.expired and self.creds.refresh_token:
            self.creds.refresh(Request())
            # Lưu lại token mới
            with open(self.token_path, 'wb') as token:
                pickle.dump(self.creds, token)

        if self.creds and self.creds.valid:
            self.service = build('drive', 'v3', credentials=self.creds)
        else:
            logger.warning("Không tìm thấy token_drive.json hợp lệ. Vui lòng chạy python generate_drive_token.py trước.")

    def upload_file(self, file_stream, filename, mime_type):
        """Upload file stream lên Google Drive"""
        if not self.service:
            raise Exception("Drive service chưa được xác thực.")

        # Thư mục chứa tài liệu trên Google Drive
        TARGET_FOLDER_ID = '1LAWgZu1wOdvGJrDCfi1d9tao2gSGuosq'

        file_metadata = {
            'name': filename,
            'parents': [TARGET_FOLDER_ID]
        }
        
        # Chuyển đổi stream thành MediaIoBaseUpload
        media = MediaIoBaseUpload(io.BytesIO(file_stream.read()), mimetype=mime_type, resumable=True)
        
        # Upload
        file = self.service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id, webViewLink, webContentLink'
        ).execute()
        
        # Cập nhật quyền để ai có link cũng có thể xem/tải
        self.service.permissions().create(
            fileId=file.get('id'),
            body={'type': 'anyone', 'role': 'reader'},
            fields='id'
        ).execute()

        return {
            'id': file.get('id'),
            'view_link': file.get('webViewLink'),
            'download_link': file.get('webContentLink')
        }

    def delete_file(self, file_id):
        """Xóa file trên Google Drive"""
        if not self.service:
            raise Exception("Drive service chưa được xác thực.")
        
        try:
            self.service.files().delete(fileId=file_id).execute()
            return True
        except Exception as e:
            logger.exception("Lỗi khi xóa file trên Drive")
            return False
