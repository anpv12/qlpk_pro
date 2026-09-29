import logging
import re

from sqlalchemy import or_

from app.models.patient import Patient
from app.models.medicine import Medicine
from sqlalchemy.orm import Session
from datetime import date

logger = logging.getLogger(__name__)

_PATIENT_CODE_PATTERN = re.compile(r'^(?:HS|BN)(\d+)$')


def _max_patient_code_number(db: Session) -> int:
    """Số lớn nhất trong các mã dạng HS/BN + số; bỏ qua mã khác định dạng (vd. dữ liệu QA)."""
    rows = db.query(Patient.patient_code).filter(
        or_(Patient.patient_code.like('HS%'), Patient.patient_code.like('BN%'))
    ).all()
    numbers = [int(match.group(1)) for (code,) in rows if code and (match := _PATIENT_CODE_PATTERN.match(code))]
    return max(numbers, default=0)


def generate_patient_code(db: Session) -> str:
    """
    Tạo mã hồ sơ tự động theo format HS + số thứ tự 5 chữ số.

    Số tiếp theo lấy theo giá trị số lớn nhất của các mã HS/BN hiện có (không so chuỗi,
    nên mã khác định dạng không làm lệch dãy); gặp mã đã tồn tại thì tăng tiếp.
    """
    max_retries = 5
    next_number = _max_patient_code_number(db) + 1
    for _ in range(max_retries):
        new_code = f"HS{str(next_number).zfill(5)}"
        if not db.query(Patient.id).filter(Patient.patient_code == new_code).first():
            return new_code
        logger.warning("Mã hồ sơ %s đã tồn tại, thử mã kế tiếp", new_code)
        next_number += 1
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