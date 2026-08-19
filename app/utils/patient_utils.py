from app.models.patient import Patient
from app.models.medicine import Medicine
from sqlalchemy.orm import Session
from datetime import date

def generate_patient_code(db: Session) -> str:
    """
    Tạo mã hồ sơ tự động theo format HS + số thứ tự 5 chữ số
    Đảm bảo mã không trùng lặp với retry logic
    
    Args:
        db: Database session
        
    Returns:
        Mã hồ sơ mới (ví dụ: HS00001, HS00002, ...)
    """
    max_retries = 5 # Số lần thử lại tối đa
    
    for attempt in range(max_retries):
        try:
            # Tìm mã hồ sơ lớn nhất hiện tại để xác định số tiếp theo
            # Sắp xếp giảm dần theo patient_code để lấy mã lớn nhất
            max_patient = db.query(Patient).order_by(Patient.patient_code.desc()).first()
            
            if max_patient and max_patient.patient_code:
                # Lấy phần số từ mã hiện tại (hỗ trợ cả "BN" và "HS")
                try:
                    code = max_patient.patient_code
                    # Hỗ trợ cả mã cũ "BN" và mã mới "HS"
                    if code.startswith('BN') or code.startswith('HS'):
                        current_number = int(code[2:])  # Bỏ qua tiền tố "BN" hoặc "HS"
                        next_number = current_number + 1
                    else:
                        # Nếu không phải định dạng BN/HS, đếm tổng số bệnh nhân
                        patient_count = db.query(Patient).count()
                        next_number = patient_count + 1
                except (ValueError, IndexError):
                    # Xử lý trường hợp mã hiện tại không đúng định dạng số
                    # hoặc không có đủ ký tự sau prefix.
                    # Trong trường hợp này, đếm tổng số bệnh nhân hiện có và bắt đầu từ đó.
                    print(f"Warning: Could not parse patient_code '{max_patient.patient_code}'. Falling back to count.")
                    patient_count = db.query(Patient).count()
                    next_number = patient_count + 1
            else:
                # Nếu chưa có bệnh nhân nào trong DB, bắt đầu từ 1
                next_number = 1
            
            # Tạo mã mới với định dạng "HS" + số thứ tự (đệm 0 để đủ 5 chữ số)
            new_code = f"HS{str(next_number).zfill(5)}"
            
            # Kiểm tra xem mã mới tạo đã tồn tại trong DB chưa
            existing = db.query(Patient).filter(Patient.patient_code == new_code).first()
            if not existing:
                # Nếu mã chưa tồn tại, trả về mã này
                return new_code
            else:
                # Nếu mã đã tồn tại (do race condition hoặc dữ liệu cũ), in cảnh báo và thử lại
                print(f"⚠️ Mã {new_code} đã tồn tại, thử lại lần {attempt + 1}")
                continue # Tiếp tục vòng lặp để thử tạo mã khác
                
        except Exception as e:
            # Bắt các lỗi ngoại lệ khác trong quá trình tạo mã
            print(f"❌ Lỗi tạo mã hồ sơ lần {attempt + 1}: {e}")
            if attempt == max_retries - 1:
                # Nếu đã thử hết số lần cho phép mà vẫn lỗi, raise exception cuối cùng
                raise e
    
    # Nếu sau tất cả các lần thử vẫn không tạo được mã duy nhất
    raise Exception("Không thể tạo mã hồ sơ duy nhất sau nhiều lần thử")


def generate_medicine_code(db: Session) -> str:
    """
    Tạo mã thuốc tự động theo format MED + số thứ tự 5 chữ số
    Đảm bảo mã không trùng lặp với retry logic
    
    Args:
        db: Database session
        
    Returns:
        Mã thuốc mới (ví dụ: MED00001, MED00002, ...)
    """
    max_retries = 5  # Số lần thử lại tối đa
    
    for attempt in range(max_retries):
        try:
            # Tìm mã thuốc lớn nhất hiện tại có định dạng MEDxxxxx
            max_medicine = db.query(Medicine).filter(
                Medicine.internal_code.like('MED%')
            ).order_by(Medicine.internal_code.desc()).first()
            
            if max_medicine and max_medicine.internal_code:
                # Lấy phần số từ mã hiện tại (ví dụ: từ "MED00005" lấy "00005") và tăng lên 1
                try:
                    current_number = int(max_medicine.internal_code[3:])  # Bỏ qua tiền tố "MED"
                    next_number = current_number + 1
                except (ValueError, IndexError):
                    # Xử lý trường hợp mã hiện tại không đúng định dạng số
                    # Đếm tổng số thuốc có mã dạng MED và bắt đầu từ đó
                    medicine_count = db.query(Medicine).filter(
                        Medicine.internal_code.like('MED%')
                    ).count()
                    next_number = medicine_count + 1
            else:
                # Nếu chưa có thuốc nào có mã dạng MED, bắt đầu từ 1
                next_number = 1
            
            # Tạo mã mới với định dạng "MED" + số thứ tự (đệm 0 để đủ 5 chữ số)
            new_code = f"MED{str(next_number).zfill(5)}"
            
            # Kiểm tra xem mã mới tạo đã tồn tại trong DB chưa
            existing = db.query(Medicine).filter(Medicine.internal_code == new_code).first()
            if not existing:
                # Nếu mã chưa tồn tại, trả về mã này
                return new_code
            else:
                # Nếu mã đã tồn tại (do race condition hoặc dữ liệu cũ), thử lại
                print(f"⚠️ Mã {new_code} đã tồn tại, thử lại lần {attempt + 1}")
                continue  # Tiếp tục vòng lặp để thử tạo mã khác
                
        except Exception as e:
            # Bắt các lỗi ngoại lệ khác trong quá trình tạo mã
            print(f"❌ Lỗi tạo mã thuốc lần {attempt + 1}: {e}")
            if attempt == max_retries - 1:
                # Nếu đã thử hết số lần cho phép mà vẫn lỗi, raise exception cuối cùng
                raise e
    
    # Nếu sau tất cả các lần thử vẫn không tạo được mã duy nhất
    raise Exception("Không thể tạo mã thuốc duy nhất sau nhiều lần thử")


def calculate_age(date_of_birth):
    """
    Tính tuổi từ ngày sinh
    
    Args:
        date_of_birth: date object hoặc None
        
    Returns:
        Tuổi (integer) hoặc None nếu không có date_of_birth
    """
    if not date_of_birth:
        return None
    
    today = date.today()
    age = today.year - date_of_birth.year
    
    # Kiểm tra nếu chưa đến sinh nhật trong năm nay
    if (today.month, today.day) < (date_of_birth.month, date_of_birth.day):
        age -= 1
    
    return age if age >= 0 else None