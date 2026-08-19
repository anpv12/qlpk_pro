import os
import pickle
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request

# Scopes cho phép toàn quyền quản lý Google Drive (để có thể nhìn thấy thư mục do user tự tạo)
SCOPES = ['https://www.googleapis.com/auth/drive']

def main():
    creds = None
    token_path = 'token_drive.json'
    credentials_path = 'credentials.json'

    # Kiểm tra xem file token đã tồn tại chưa
    if os.path.exists(token_path):
        with open(token_path, 'rb') as token:
            creds = pickle.load(token)
            
    # Nếu chưa có credential hợp lệ, yêu cầu user đăng nhập
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not os.path.exists(credentials_path):
                print(f"Lỗi: Không tìm thấy file {credentials_path}")
                print("Vui lòng đảm bảo file credentials.json đã được lưu ở thư mục gốc.")
                return

            flow = InstalledAppFlow.from_client_secrets_file(
                credentials_path, SCOPES)
            creds = flow.run_local_server(port=8080)
            
        # Lưu lại credential cho các lần chạy sau
        with open(token_path, 'wb') as token:
            pickle.dump(creds, token)
            print("Đã xác thực thành công và lưu file token_drive.json!")

if __name__ == '__main__':
    main()
