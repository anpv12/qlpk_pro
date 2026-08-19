def format_phone_number(phone_number: str) -> str:
    """
    Format số điện thoại theo chuẩn E.164 quốc tế
    
    Args:
        phone_number: Số điện thoại cần format
        
    Returns:
        Số điện thoại đã format theo chuẩn E.164 (ví dụ: +84364565305)
    """
    if not phone_number:
        return phone_number
    
    # Loại bỏ khoảng trắng
    phone_number = phone_number.replace(" ", "")
    
    # Đảm bảo có dấu + ở đầu
    if not phone_number.startswith('+'):
        # Mặc định mã vùng Việt Nam nếu không có
        if phone_number.startswith('0'):
            phone_number = '+84' + phone_number[1:]
        else:
            phone_number = '+' + phone_number
    
    return phone_number 