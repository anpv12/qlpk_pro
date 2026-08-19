#!/usr/bin/env python3
"""
Script tạo file template Excel import thuốc với màu đỏ cho các field bắt buộc
"""
import os
import sys
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.comments import Comment
from openpyxl.worksheet.datavalidation import DataValidation

# Thêm đường dẫn project vào sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

def create_medicine_template():
    """Tạo file template Excel import thuốc"""
    
    # Tạo workbook
    wb = Workbook()
    ws = wb.active
    ws.title = "Mẫu import thuốc"
    
    # Định nghĩa header - SẮP XẾP THEO THỨ TỰ TRONG MODAL "THÊM THUỐC MỚI"
    # Card 1: Thông tin cơ bản
    # Card 2: Quy cách đóng gói & Số lượng tồn
    # Card 3: Giá cả & Phân loại
    # Card 4: Cảnh báo & Thông tin khác
    headers = [
        # Card 1: Thông tin cơ bản
        'Tên thuốc/dụng cụ *',      # 0 - Bắt buộc
        'Tên gốc/Biệt dược',         # 1
        'Mã thuốc',                   # 2 - Đặc biệt
        'Mã DQG',                     # 3
        'Phương thức dùng *',         # 4 - Bắt buộc
        'Đơn vị dùng *',              # 5 - Bắt buộc
        # Card 2: Quy cách đóng gói & Số lượng tồn
        'Đóng gói',                   # 6
        'Số đơn vị',                  # 7
        'Tổng tồn (viên) *',              # 8 - Bắt buộc (tương ứng với "Tổng (viên)" trong UI)
        # Lưu ý: "Hộp/Lọ/Vỉ/Chai Tồn", "Viên/Gói/Chai/Ống Tồn", "Quy cách" được tự động tính từ các field trên
        # Card 3: Giá cả & Phân loại
        'Đơn giá vốn nhập',           # 12 - Không bắt buộc
        'Đơn giá bán',                # 13 - Không bắt buộc
        'Thể loại *',                 # 14 - Bắt buộc
        'Thuốc Nội/Ngoại',            # 15
        'Loại đơn thuốc *',           # 16 - Bắt buộc, Đặc biệt
        'Nguồn gốc',                  # 17
        # Card 4: Cảnh báo & Thông tin khác
        'Ngày hết hạn',               # 18 - Không bắt buộc
        'Cảnh báo SL tồn',            # 19
        'Cảnh báo hết hạn',           # 20
        'Hàm lượng',                  # 21
        'Ghi chú'                     # 22
    ]
    
    # Dữ liệu mẫu - theo thứ tự header mới
    sample_row = [
        # Card 1: Thông tin cơ bản
        'Paracetamol 500mg',          # Tên thuốc/dụng cụ
        'Acetaminophen',               # Tên gốc/Biệt dược
        'PA500',                       # Mã thuốc
        'N02BE01',                     # Mã DQG
        'Uống',                        # Phương thức dùng
        'viên',                        # Đơn vị dùng
        # Card 2: Quy cách đóng gói & Số lượng tồn
        'vỉ',                          # Đóng gói
        '10',                          # Số đơn vị
        '1000',                        # Tổng tồn (viên) - Bắt buộc
        # Lưu ý: "Hộp/Lọ/Vỉ/Chai Tồn", "Viên/Gói/Chai/Ống Tồn", "Quy cách" được tự động tính
        # Card 3: Giá cả & Phân loại
        '3000',                        # Đơn giá vốn nhập
        '5000',                        # Đơn giá bán
        'Thuốc',                       # Thể loại
        'Nội',                         # Thuốc Nội/Ngoại
        'Cơ bản',                      # Loại đơn thuốc
        'Việt Nam',                    # Nguồn gốc
        # Card 4: Cảnh báo & Thông tin khác
        '2025-12-31',                  # Ngày hết hạn
        '50',                          # Cảnh báo SL tồn
        '30',                          # Cảnh báo hết hạn
        '500mg',                       # Hàm lượng
        'Thuốc giảm đau, hạ sốt'      # Ghi chú
    ]
    
    # Danh sách index các cột bắt buộc (có dấu *)
    # 0: Tên thuốc/dụng cụ, 4: Phương thức dùng, 5: Đơn vị dùng, 8: Tổng tồn (viên)
    # 11: Thể loại, 13: Loại đơn thuốc
    # (Đã bỏ các cột tự động tính: Hộp/Lọ/Vỉ/Chai Tồn, Viên/Gói/Chai/Ống Tồn, Quy cách)
    # (Đã bỏ bắt buộc: 9: Đơn giá vốn nhập, 10: Đơn giá bán, 15: Ngày hết hạn)
    required_indices = [0, 4, 5, 8, 11, 13]
    
    # Index các cột đặc biệt cần làm nổi bật
    special_indices = {
        2: 'Mã thuốc',  # Index 2 - Mã thuốc
        13: 'Loại đơn thuốc *'  # Index 13 - Loại đơn thuốc (đã đổi vị trí sau khi bỏ các cột tự động tính)
    }
    
    # Định nghĩa style
    # Style cho header bắt buộc (đỏ)
    required_header_fill = PatternFill(start_color='DC3545', end_color='DC3545', fill_type='solid')
    # Style cho header không bắt buộc (xanh)
    optional_header_fill = PatternFill(start_color='4472C4', end_color='4472C4', fill_type='solid')
    # Style đặc biệt cho "Loại đơn thuốc" và "Mã thuốc" (vàng cam với border đậm)
    special_header_fill = PatternFill(start_color='FF8C00', end_color='FF8C00', fill_type='solid')
    # Font trắng, đậm
    header_font = Font(bold=True, color='FFFFFF', size=12)
    # Font đặc biệt cho các cột quan trọng (lớn hơn, đậm hơn)
    special_header_font = Font(bold=True, color='FFFFFF', size=13)
    # Alignment center
    header_alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
    # Border thường
    thin_border = Border(
        left=Side(style='thin', color='000000'),
        right=Side(style='thin', color='000000'),
        top=Side(style='thin', color='000000'),
        bottom=Side(style='thin', color='000000')
    )
    # Border đậm cho cột đặc biệt
    thick_border = Border(
        left=Side(style='thick', color='000000'),
        right=Side(style='thick', color='000000'),
        top=Side(style='thick', color='000000'),
        bottom=Side(style='thick', color='000000')
    )
    
    # Ghi header
    for col_idx, header in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        col_index = col_idx - 1
        
        # Kiểm tra nếu là cột đặc biệt (Mã thuốc hoặc Loại đơn thuốc)
        if col_index in special_indices:
            cell.fill = special_header_fill
            cell.font = special_header_font
            cell.border = thick_border
            # Thêm comment chú giải
            if col_index == 2:  # Mã thuốc
                comment_text = (
                    "⚠️ QUAN TRỌNG: Mã thuốc\n\n"
                    "• Mã định danh duy nhất cho từng thuốc trong hệ thống\n"
                    "• Nếu để trống, hệ thống sẽ tự động tạo mã\n"
                    "• Nếu nhập, phải đảm bảo mã không trùng với thuốc khác\n"
                    "• Khuyến nghị: Sử dụng mã ngắn gọn, dễ nhớ (VD: PA500, AMX250)"
                )
            elif col_index == 13:  # Loại đơn thuốc (đã đổi vị trí sau khi bỏ các cột tự động tính)
                comment_text = (
                    "⚠️ BẮT BUỘC: Loại đơn thuốc\n\n"
                    "• Thuốc độc: Thuốc độc, cần quản lý nghiêm ngặt\n"
                    "• Thuốc H: Thuốc có chứa chất gây nghiện, cần quản lý đặc biệt\n"
                    "• Thuốc N: Thuốc cần quản lý đặc biệt theo quy định\n"
                    "• Cơ bản: Đơn thuốc thông thường\n\n"
                    "Lưu ý: Field này BẮT BUỘC phải điền!"
                )
                cell.comment = Comment(comment_text, "Hệ thống")
        # Áp dụng màu đỏ nếu là field bắt buộc (nhưng không phải cột đặc biệt)
        elif col_index in required_indices:
            cell.fill = required_header_fill
            cell.font = header_font
            cell.border = thin_border
        else:
            cell.fill = optional_header_fill
            cell.font = header_font
            cell.border = thin_border
        
        cell.alignment = header_alignment
    
    # Ghi dữ liệu mẫu
    for col_idx, value in enumerate(sample_row, start=1):
        cell = ws.cell(row=2, column=col_idx, value=value)
        cell.border = thin_border
        cell.alignment = Alignment(horizontal='left', vertical='center')
    
    # Điều chỉnh độ rộng cột
    for col_idx in range(1, len(headers) + 1):
        col_letter = get_column_letter(col_idx)
        ws.column_dimensions[col_letter].width = max(len(headers[col_idx - 1]), 15)
    
    # Tạo dropdown list cho cột "Loại đơn thuốc" (index 13, cột N)
    prescription_type_col = 14  # Cột N (index 13 + 1 vì bắt đầu từ 1)
    col_letter = get_column_letter(prescription_type_col)
    
    # Tạo DataValidation với 4 option (đã thêm Thuốc độc)
    prescription_options = "Thuốc độc,Thuốc H,Thuốc N,Cơ bản"
    dv = DataValidation(type="list", formula1=f'"{prescription_options}"', allow_blank=False)
    dv.error = "Giá trị không hợp lệ!"
    dv.errorTitle = "Lỗi nhập liệu"
    dv.prompt = "Vui lòng chọn một trong các giá trị: Thuốc độc, Thuốc H, Thuốc N, hoặc Cơ bản"
    dv.promptTitle = "Loại đơn thuốc"
    
    # Áp dụng cho tất cả các dòng từ dòng 2 đến dòng 1000 (đủ cho hầu hết các trường hợp)
    dv_range = f"{col_letter}2:{col_letter}1000"
    ws.add_data_validation(dv)
    dv.add(dv_range)
    
    print(f"Đã tạo dropdown list cho cột '{col_letter}' (Loại đơn thuốc) từ dòng 2 đến 1000")
    
    # Tạo sheet hướng dẫn
    guide_ws = wb.create_sheet("Hướng dẫn")
    guide_data = [
        ['HƯỚNG DẪN IMPORT THUỐC'],
        [''],
        ['CÁC FIELD BẮT BUỘC (có dấu * và màu đỏ trong header):'],
        ['1. Tên thuốc/dụng cụ *'],
        ['2. Phương thức dùng *'],
        ['3. Đơn vị dùng *'],
        ['4. Tổng tồn (viên) * (tương ứng với "Tổng (viên)" trong UI)'],
        ['   - Nhập trực tiếp tổng số lượng (ví dụ: 1000)'],
        ['   - Hệ thống sẽ tự động tính "Hộp/Lọ/Vỉ/Chai Tồn" và "Viên/Gói/Chai/Ống Tồn" từ:'],
        ['     • Tổng tồn (viên) ÷ Số đơn vị = Số đơn vị đóng gói tồn'],
        ['     • Phần dư = Số lẻ tồn'],
        ['   - Ví dụ: 1005 viên ÷ 10 viên/vỉ = 100 vỉ + 5 viên lẻ'],
        [''],
        ['💡 CÁC FIELD TỰ ĐỘNG TÍNH (KHÔNG CẦN NHẬP):'],
        ['   - "Hộp/Lọ/Vỉ/Chai Tồn": Tự động tính từ Tổng tồn (viên) và Số đơn vị'],
        ['   - "Viên/Gói/Chai/Ống Tồn": Tự động tính từ Tổng tồn (viên) và Số đơn vị'],
        ['   - "Quy cách": Tự động tính từ Đóng gói và Số đơn vị'],
        ['   - Các field này KHÔNG có trong template vì được tự động tính'],
        ['5. Đơn giá vốn nhập (không bắt buộc, có thể để trống hoặc = 0)'],
        ['6. Đơn giá bán (không bắt buộc, có thể để trống hoặc = 0)'],
        ['7. Thể loại * (Thuốc/TPCN/Y dụng cụ)'],
        ['8. Loại đơn thuốc * (Thuốc độc/Thuốc H/Thuốc N/Cơ bản) - XEM CHÚ GIẢI BÊN DƯỚI'],
        ['9. Ngày hết hạn (không bắt buộc, có thể để trống)'],
        [''],
        ['⚠️ CÁC FIELD ĐẶC BIỆT (màu cam, có border đậm và comment):'],
        [''],
        ['📋 MÃ THUỐC (cột C - có màu cam và border đậm):'],
        ['  • Mã định danh duy nhất cho từng thuốc trong hệ thống'],
        ['  • Nếu để trống: Hệ thống sẽ tự động tạo mã'],
        ['  • Nếu nhập: Phải đảm bảo mã KHÔNG TRÙNG với thuốc khác'],
        ['  • Khuyến nghị: Sử dụng mã ngắn gọn, dễ nhớ'],
        ['  • Ví dụ: PA500 (Paracetamol 500mg), AMX250 (Amoxicillin 250mg)'],
        [''],
        ['⚠️ LOẠI ĐƠN THUỐC * (cột N - có màu cam và border đậm) - BẮT BUỘC:'],
        ['  • Thuốc độc: Thuốc độc, cần quản lý nghiêm ngặt'],
        ['    - Ví dụ: Các thuốc có độc tính cao, cần kê đơn đặc biệt'],
        ['  • Thuốc H: Thuốc có chứa chất gây nghiện, cần quản lý đặc biệt'],
        ['    - Ví dụ: Morphine, Codeine, các thuốc giảm đau gây nghiện'],
        ['  • Thuốc N: Thuốc cần quản lý đặc biệt theo quy định'],
        ['    - Ví dụ: Các thuốc theo quy định riêng'],
        ['  • Cơ bản: Đơn thuốc thông thường, không có chất đặc biệt'],
        ['  • LƯU Ý: Field này BẮT BUỘC phải điền, không được để trống!'],
        ['  • 💡 CÓ DROPDOWN LIST: Click vào ô sẽ hiện danh sách để chọn'],
        ['    - Chỉ cần chọn từ dropdown, không cần gõ tay'],
        ['    - Tránh nhập sai chính tả hoặc giá trị không hợp lệ'],
        [''],
        ['💡 CÁCH XEM CHÚ GIẢI TRONG EXCEL:'],
        ['  • Di chuột vào ô header có màu cam (Mã thuốc hoặc Loại đơn thuốc)'],
        ['  • Hoặc click chuột phải vào ô và chọn "Show Comment"'],
        [''],
        ['LƯU Ý CHUNG:'],
        ['- Các field có dấu * và màu đỏ là bắt buộc phải điền'],
        ['- Các field màu cam là đặc biệt quan trọng, cần chú ý'],
        ['- Đảm bảo định dạng ngày tháng đúng (YYYY-MM-DD hoặc DD/MM/YYYY)'],
        ['- Đơn giá và số lượng phải là số hợp lệ'],
        ['- Xóa dòng mẫu (dòng 2) trước khi nhập dữ liệu thực tế']
    ]
    
    for row_idx, row_data in enumerate(guide_data, start=1):
        for col_idx, value in enumerate(row_data, start=1):
            cell = guide_ws.cell(row=row_idx, column=col_idx, value=value)
            if row_idx == 1:  # Tiêu đề
                cell.font = Font(bold=True, size=14)
            elif row_idx == 3 or row_idx == 13:  # Tiêu đề phụ
                cell.font = Font(bold=True, size=12)
    
    guide_ws.column_dimensions['A'].width = 60
    
    # Lưu file
    output_path = os.path.join(os.path.dirname(__file__), '..', 'app', 'static', 'uploads', 'mau_import_thuoc.xlsx')
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    wb.save(output_path)
    print(f"Đã tạo file template thành công: {output_path}")
    return output_path

if __name__ == '__main__':
    create_medicine_template()

